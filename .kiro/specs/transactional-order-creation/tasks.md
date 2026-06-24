# Implementation Plan: Transactional Order Creation

## Overview

Kế hoạch triển khai bọc luồng tạo đơn (`POST /api/orders` trong `backend-api/routes/orders.ts`) bằng MongoDB multi-document transaction (Mongoose `session.withTransaction()`), di chuyển trừ tồn kho có điều kiện vào transaction, chuyển `SellerWallet` sang `findOneAndUpdate $inc` với session, giữ bù trừ Redis thủ công trong `catch`, phát hiện lỗi thiếu replica set, và cập nhật hạ tầng môi trường sang replica set. Các bước được sắp xếp tăng dần: dựng hạ tầng test trước, refactor handler, rồi bổ sung property-based tests (P1–P6), unit/example tests và edge/integration/smoke tests.

Ngôn ngữ triển khai: **TypeScript** (theo design). Test runner: **Jest + ts-jest**; property-based: **fast-check** (≥100 iteration); MongoDB replica set (mongo `--replSet rs0` hoặc `mongodb-memory-server` replica set) để chạy transaction trong test.

## Tasks

- [x] 1. Dựng hạ tầng test cho backend-api
  - Cài và cấu hình `jest`, `ts-jest`, `@types/jest`, `fast-check` trong `backend-api/package.json`
  - Tạo `backend-api/jest.config.js` (preset ts-jest, testMatch cho `**/*.test.ts`, `testTimeout` đủ lớn cho transaction)
  - Thêm script `"test": "jest --run"` (chạy một lần, không watch) vào `backend-api/package.json`
  - Tạo helper khởi tạo MongoDB replica set cho test: `backend-api/__tests__/helpers/mongoTestServer.ts` dùng `mongodb-memory-server` ở chế độ replica set (hoặc kết nối tới mongo `--replSet rs0`), cung cấp `connect()/disconnect()/clearAll()`
  - Tạo helper mock/dọn Redis cho test: `backend-api/__tests__/helpers/redisTestHelper.ts` (mock `RedisInventoryService` với `decrementInventory`/`rollbackInventory` có thể theo dõi và ép lỗi)
  - Tạo helper seed dữ liệu: `backend-api/__tests__/helpers/seed.ts` (tạo `User`, `Shop`, `Product`, `SellerWallet` mẫu) và helper gọi handler `POST /api/orders` (supertest hoặc gọi trực tiếp app Express)
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 2. Refactor handler tạo đơn sang dùng transaction
  - [x] 2.1 Chuẩn bị phần đọc/tính toán trước transaction
    - Trong `router.post('/')` của `backend-api/routes/orders.ts`, giữ phần đọc/validate `Product`, tính phí ship + `DiscountEngine`, đọc Promotion/Shop **trước** khi mở transaction để callback ngắn gọn và an toàn khi retry
    - Giữ bước trừ tồn kho Redis flash sale **trước/ngoài** transaction; nếu Redis trả `-2` (không đủ) → hoàn phần đã trừ và trả 400 trước khi chạm MongoDB
    - Ghi nhận danh sách `redisDecremented` (promotionId, productId, qty) để bù trừ trong `catch`
    - _Requirements: 3.1, 3.4_

  - [x] 2.2 Bọc thao tác ghi MongoDB trong `session.withTransaction`
    - Mở `mongoose.startSession()` và `session.withTransaction(async () => { ... })`
    - Trong callback, **reset** `createdOrders = []` ở đầu để an toàn khi retry; không đặt side-effect Redis trong callback
    - Thứ tự: (1) trừ `User.coinsBalance` + `CoinTransaction` spend (khi redeem) với `{ session }`; (2) tạo các `Order` theo shop + `CoinTransaction` earn (pending) với `{ session }` / `create([...], { session })`
    - _Requirements: 1.1, 1.2, 4.1_

  - [x] 2.3 Di chuyển trừ tồn kho có điều kiện vào transaction
    - Trong callback transaction, với mỗi item gọi `Product.findOneAndUpdate({ _id, countInStock: { $gte: qty } }, { $inc: { countInStock: -qty } }, { session, new: true })`
    - Nếu kết quả `null` → `throw InsufficientStockError(productId)` để abort transaction
    - Định nghĩa lớp lỗi `InsufficientStockError` (hoặc Error có dấu hiệu nhận diện) để map sang HTTP 400
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.4 Chuyển SellerWallet sang findOneAndUpdate $inc trong transaction
    - Thay logic đọc-sửa-ghi `SellerWallet` bằng `SellerWallet.findOneAndUpdate({ shopId }, { $inc: { pendingEscrow: order.totalPrice } }, { session, new: true, upsert: true })` cho từng order đã tạo
    - _Requirements: 1.1, 4.1_

  - [x] 2.5 Loại bỏ rollback thủ công MongoDB và bù trừ Redis trong catch
    - Xóa toàn bộ các vòng lặp hoàn kho/hoàn coins/xóa Order/giảm escrow trong `catch` (transaction tự abort)
    - Trong `catch`, chỉ giữ bù trừ thủ công cho Redis: lặp `redisDecremented` gọi `RedisInventoryService.rollbackInventory(...)`; nếu rollback Redis lỗi → chỉ `console.error`, không làm hỏng phản hồi
    - `finally`: `await session.endSession()`
    - _Requirements: 4.1, 4.2, 3.2, 3.3_

  - [x] 2.6 Phát hiện lỗi thiếu replica set và ánh xạ lỗi → HTTP
    - Sau khi `withTransaction` thất bại, phân loại lỗi: dấu hiệu thiếu replica set (codeName `IllegalOperation` / thông điệp chứa "replica set member or mongos") → trả lỗi cấu hình replica set rõ ràng + log cảnh báo
    - Lỗi nghiệp vụ (thiếu kho/voucher) → 400 với thông báo tương ứng; lỗi khác → 400 `error.message` hoặc `Server error creating order`
    - Giữ tương đương hành vi đối ngoại: thành công trả **201** với `createdOrders[0]`
    - _Requirements: 5.2, 1.4, 4.3_

  - [x]* 2.7 Viết unit/example tests cho tương đương hợp đồng API
    - Tạo đơn thành công: 201 + body là document order đầu tiên (`status: "Pending"`), kho giảm đúng qty
    - Giỏ rỗng → 400 `No order items`; Product không tồn tại → 400 `Product {id} not found`; voucher livestream-only → 400 (giữ nguyên thông báo)
    - Redis `rollbackInventory` ném lỗi (mock) → handler vẫn trả 400, không crash
    - _Requirements: 4.3, 3.3_

- [x] 3. Checkpoint - Đảm bảo build và test hiện có chạy được
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Viết property-based tests cho các correctness properties
  - [x]* 4.1 Property test cho đường thành công (P1)
    - **Property 1: Đường thành công áp dụng nhất quán mọi thay đổi**
    - **Validates: Requirements 1.1, 1.2**
    - Generator: giỏ hàng hợp lệ (số shop, số item, qty ≤ kho, coins ≤ giới hạn); assert số `Order` = số shop group, mỗi `countInStock` giảm đúng tổng qty, tổng `pendingEscrow` tăng đúng tổng `totalPrice`, `coinsBalance` giảm đúng `coinsToRedeem`
    - Comment tham chiếu: `// Feature: transactional-order-creation, Property 1: ...`; `numRuns: 100`

  - [x]* 4.2 Property test cho tính nguyên tử khi abort (P2)
    - **Property 2: Tính nguyên tử khi abort**
    - **Validates: Requirements 1.3, 1.4**
    - Generator: giỏ hàng + điểm thất bại (item vượt kho ở bước trừ / mock lỗi ghi ví); assert trạng thái MongoDB sau = trước (không Order/CoinTransaction/thay đổi countInStock/coinsBalance/pendingEscrow) và trả HTTP 400 kèm thông báo
    - Comment tham chiếu: `// Feature: transactional-order-creation, Property 2: ...`; `numRuns: 100`

  - [x]* 4.3 Property test cho từ chối thiếu kho trong transaction (P3)
    - **Property 3: Từ chối khi thiếu kho ở bước trừ trong transaction**
    - **Validates: Requirements 2.2**
    - Generator: giỏ hàng có ≥1 item `qty > countInStock`; assert abort + HTTP 400 nêu rõ sản phẩm thiếu, không tạo Order, không thay đổi `countInStock`
    - Comment tham chiếu: `// Feature: transactional-order-creation, Property 3: ...`; `numRuns: 100`

  - [x]* 4.4 Property test cho an toàn cạnh tranh — không bán âm (P4)
    - **Property 4: An toàn cạnh tranh — không bán âm tồn kho**
    - **Validates: Requirements 2.3**
    - Generator: tồn kho `N`, số request đồng thời `k`, `qty`; chạy `Promise.all` các request; assert số đơn thành công ≤ `floor(N/qty)`, `countInStock` cuối `>= 0` và `= N - (thành công × qty)`
    - Comment tham chiếu: `// Feature: transactional-order-creation, Property 4: ...`; `numRuns: 100`

  - [x]* 4.5 Property test cho nhất quán Redis–MongoDB khi abort (P5)
    - **Property 5: Nhất quán Redis–MongoDB khi abort**
    - **Validates: Requirements 3.2, 4.2**
    - Generator: sản phẩm flash sale, Redis stock `S`, kịch bản khiến transaction abort sau khi trừ Redis; assert Redis stock được hoàn về `S`
    - Comment tham chiếu: `// Feature: transactional-order-creation, Property 5: ...`; `numRuns: 100`

  - [x]* 4.6 Property test cho từ chối trước commit khi Redis thiếu (P6)
    - **Property 6: Từ chối trước commit khi Redis flash sale không đủ**
    - **Validates: Requirements 3.4**
    - Generator: yêu cầu mua flash sale với `qty > tồn kho Redis`; assert HTTP 400 trước khi commit, không có ghi MongoDB nào (Order/kho/ví/coins)
    - Comment tham chiếu: `// Feature: transactional-order-creation, Property 6: ...`; `numRuns: 100`

- [x] 5. Checkpoint - Đảm bảo property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Viết edge-case, integration và smoke tests
  - [x]* 6.1 Edge-case test cho môi trường thiếu replica set (Req 5.2)
    - Mock `session.withTransaction` ném lỗi thiếu replica set (codeName `IllegalOperation` / "replica set member or mongos")
    - Assert trả lỗi cấu hình replica set rõ ràng và KHÔNG có ghi MongoDB nửa vời nào tồn tại
    - _Requirements: 5.2_

  - [x]* 6.2 Integration test cho trừ tồn kho Redis flash sale (Req 3.1)
    - Đặt mua sản phẩm flash sale active; assert `RedisInventoryService.decrementInventory` được gọi và Redis stock giảm đúng qty
    - _Requirements: 3.1_

  - [x]* 6.3 Smoke test ràng buộc cấu hình replica set (Req 5.1, 5.3)
    - Boot môi trường test với mongo replica set; kiểm tra `docker-compose.yml` và `.env.example` đã ghi `replicaSet=rs0`
    - _Requirements: 5.1, 5.3_

- [x] 7. Cập nhật cấu hình môi trường sang replica set
  - [x] 7.1 Cập nhật docker-compose mongo sang replica set
    - Sửa service `mongodb` trong `docker-compose.yml`: `command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]` + healthcheck `rs.initiate` một node như design
    - _Requirements: 5.1, 5.3_

  - [x] 7.2 Cập nhật MONGO_URI và .env.example
    - Cập nhật `MONGO_URI` của `backend-api` thành `mongodb://mongodb:27017/stuffy_db?replicaSet=rs0`
    - Ghi nhận ràng buộc `replicaSet=rs0` trong `backend-api/.env.example` (và `.env.example` gốc nếu liên quan)
    - _Requirements: 5.3_

- [x] 8. Final checkpoint - Đảm bảo toàn bộ test pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Các task gắn `*` là tùy chọn (unit/property/integration/edge/smoke tests) và có thể bỏ qua để có MVP nhanh; task hiện thực lõi không bao giờ tùy chọn.
- Mỗi task tham chiếu requirements/properties cụ thể để truy vết.
- Mỗi property P1–P6 được hiện thực bằng đúng một property test, ≥100 iteration, kèm comment `// Feature: transactional-order-creation, Property {n}: {text}`.
- Checkpoint đảm bảo kiểm chứng tăng dần; property tests kiểm chứng các bất biến phổ quát; unit/example tests kiểm chứng tương đương hợp đồng API.
- Giữ tương đương hành vi API đối ngoại: 201 với `createdOrders[0]` khi thành công, 400 với cấu trúc/thông báo lỗi như hiện tại.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "7.1", "7.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5"] },
    { "id": 5, "tasks": ["2.6"] },
    { "id": 6, "tasks": ["2.7", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "6.1", "6.2", "6.3"] }
  ]
}
```
