# Requirements Document

## Introduction

Tính năng này bọc luồng tạo đơn hàng trong `backend-api/routes/orders.ts` (handler `POST /api/orders`) bằng MongoDB multi-document transaction (Mongoose session / `withTransaction`), nhằm đảm bảo tính nguyên tử (atomicity) cho tất cả các thao tác ghi liên quan đến một lần đặt hàng.

Luồng tạo đơn hiện tại thực hiện nhiều bước ghi tách rời nhau (tạo nhiều `Order` theo từng shop, trừ tồn kho `Product`, cập nhật `SellerWallet.pendingEscrow`, trừ `User.coinsBalance`, ghi `CoinTransaction`) và dựa vào logic rollback/bù trừ thủ công khi có lỗi. Cách làm này tạo ra khe hở race condition (kiểm tra tồn kho ở đầu luồng tách rời khỏi lúc trừ tồn kho ở cuối luồng) và dễ để lại dữ liệu không nhất quán nếu một bước thất bại giữa chừng.

Mục tiêu: mọi thao tác ghi của một lần đặt hàng hoặc cùng thành công, hoặc cùng được hủy bỏ (all-or-nothing), loại bỏ logic rollback thủ công dễ vỡ, đồng thời xử lý đúng phần tồn kho flash sale lưu ở Redis (nằm ngoài phạm vi transaction của MongoDB).

## Glossary

- **Transaction (MongoDB):** Cơ chế multi-document transaction của MongoDB cho phép nhiều thao tác ghi cùng commit hoặc cùng abort. Yêu cầu MongoDB chạy ở chế độ replica set.
- **Session (Mongoose):** Đối tượng phiên (`mongoose.startSession()`) gắn các thao tác ghi vào cùng một transaction.
- **Atomicity (tính nguyên tử):** Tính chất "all-or-nothing": tập hợp thao tác hoặc thành công trọn vẹn, hoặc không để lại bất kỳ thay đổi nào.
- **Escrow (ký quỹ):** Số tiền giữ tạm của đơn hàng, theo dõi qua `SellerWallet.pendingEscrow` cho tới khi giải ngân cho người bán.
- **Flash sale inventory:** Tồn kho khuyến mãi giới hạn được quản lý trên Redis qua `RedisInventoryService`, nằm ngoài transaction MongoDB.
- **Rollback thủ công:** Logic bù trừ bằng tay (hoàn tồn kho, hoàn coins, xóa Order...) khi có lỗi, thay vì dựa vào abort của transaction.
- **Replica set:** Cụm MongoDB nhiều node, điều kiện bắt buộc để dùng transaction.

**Phạm vi (trong):**
- Handler `POST /api/orders` trong `backend-api/routes/orders.ts`.
- Các thao tác ghi MongoDB: `Order` (nhiều document), `Product.countInStock`, `SellerWallet.pendingEscrow`, `User.coinsBalance`, `CoinTransaction`.
- Phối hợp giữa transaction MongoDB và việc trừ/hoàn tồn kho flash sale trên Redis (`RedisInventoryService`).

**Phạm vi (ngoài):**
- Các handler khác trong `orders.ts` (ví dụ `PUT /:id/status`, `/:id/receive`, dispute).
- Thay đổi logic tính giá/giảm giá của `DiscountEngine`.
- Thay đổi hạ tầng triển khai production (chỉ ghi nhận ràng buộc replica set).

## Requirements

### Requirement 1: Tính nguyên tử của việc tạo đơn

**User Story:** Là người mua đặt hàng, tôi muốn toàn bộ thao tác của một lần đặt hàng hoàn tất trọn vẹn hoặc không có gì được ghi lại, để tài khoản và tồn kho không bao giờ rơi vào trạng thái nửa vời.

#### Acceptance Criteria

1. WHEN một yêu cầu `POST /api/orders` hợp lệ được xử lý THEN hệ thống SHALL thực hiện toàn bộ thao tác ghi MongoDB (tạo các `Order`, trừ `Product.countInStock`, cập nhật `SellerWallet.pendingEscrow`, trừ `User.coinsBalance`, ghi `CoinTransaction`) trong một MongoDB transaction duy nhất.
2. WHEN tất cả thao tác trong transaction thành công THEN hệ thống SHALL commit transaction và trả về HTTP 201 cùng đơn hàng đầu tiên đã tạo.
3. WHEN bất kỳ thao tác ghi MongoDB nào trong luồng thất bại THEN hệ thống SHALL abort transaction sao cho không có `Order` nào được lưu, không có thay đổi tồn kho, ví, coins hay `CoinTransaction` nào tồn tại lại.
4. WHEN transaction bị abort THEN hệ thống SHALL trả về HTTP 400 với thông báo lỗi mô tả nguyên nhân.

### Requirement 2: Toàn vẹn tồn kho dưới điều kiện cạnh tranh (race condition)

**User Story:** Là chủ shop, tôi muốn tồn kho không bao giờ bị bán âm khi nhiều người mua cùng một sản phẩm đồng thời, để tránh bán vượt hàng tồn.

#### Acceptance Criteria

1. WHEN trừ tồn kho cho một sản phẩm trong transaction THEN hệ thống SHALL thực hiện trừ có điều kiện (chỉ trừ khi `countInStock >= qty`) trong cùng transaction.
2. IF tồn kho của bất kỳ sản phẩm nào không đủ tại thời điểm trừ THEN hệ thống SHALL abort transaction và trả về HTTP 400 với thông báo nêu rõ sản phẩm thiếu hàng.
3. WHEN hai yêu cầu đặt hàng đồng thời cùng tranh giành sản phẩm có tồn kho chỉ đủ cho một đơn THEN hệ thống SHALL cho phép tối đa một đơn thành công và đơn còn lại bị từ chối, KHÔNG để `countInStock` xuống dưới 0.

### Requirement 3: Phối hợp với tồn kho flash sale trên Redis

**User Story:** Là người vận hành, tôi muốn tồn kho flash sale trên Redis luôn khớp với kết quả cuối cùng của đơn hàng, để không bị lệch số liệu giữa Redis và MongoDB.

#### Acceptance Criteria

1. WHEN một sản phẩm có flash sale đang hoạt động được đặt mua THEN hệ thống SHALL trừ tồn kho flash sale trên Redis qua `RedisInventoryService` như hiện tại.
2. IF MongoDB transaction bị abort sau khi đã trừ tồn kho Redis THEN hệ thống SHALL hoàn (rollback) lại đúng số lượng tồn kho flash sale đã trừ trên Redis.
3. IF việc hoàn tồn kho Redis thất bại THEN hệ thống SHALL ghi log lỗi mà không làm hỏng phản hồi trả về cho client.
4. WHEN tồn kho flash sale trên Redis không đủ THEN hệ thống SHALL từ chối đơn (HTTP 400) trước khi commit transaction MongoDB.

### Requirement 4: Loại bỏ logic rollback thủ công

**User Story:** Là lập trình viên bảo trì, tôi muốn luồng tạo đơn không còn các vòng lặp bù trừ thủ công cho MongoDB, để mã nguồn dễ đọc và ít rủi ro sai sót.

#### Acceptance Criteria

1. WHEN tính năng được triển khai THEN hệ thống SHALL chuyển đồng thời (cùng một lúc) toàn bộ bốn loại thao tác ghi MongoDB (trừ tồn kho `Product.countInStock`, trừ `User.coinsBalance`, tạo các `Order`, cập nhật `SellerWallet.pendingEscrow` cùng `CoinTransaction`) sang dựa vào cơ chế abort của transaction thay cho các vòng lặp khôi phục thủ công, KHÔNG giữ lại rollback thủ công cho bất kỳ thao tác MongoDB nào và KHÔNG áp dụng chuyển đổi theo từng giai đoạn (no phased migration).
2. WHERE một thao tác nằm ngoài transaction MongoDB (cụ thể là Redis flash sale) THE hệ thống SHALL vẫn giữ cơ chế bù trừ thủ công cho riêng thao tác đó.
3. WHEN refactor hoàn tất THEN hành vi đối ngoại của API (mã trạng thái, cấu trúc phản hồi, thông báo lỗi cho các trường hợp đã có) SHALL được giữ tương đương với hiện tại.

### Requirement 5: Ràng buộc môi trường và khả năng tương thích

**User Story:** Là người vận hành triển khai, tôi muốn hệ thống nêu rõ điều kiện cần để transaction hoạt động, để môi trường được cấu hình đúng.

#### Acceptance Criteria

1. WHERE MongoDB được kết nối ở chế độ replica set THE hệ thống SHALL sử dụng transaction cho luồng tạo đơn.
2. IF MongoDB đang chạy ở chế độ single-node (không hỗ trợ transaction) THEN hệ thống SHALL có hành vi xác định rõ ràng (làm rõ ở giai đoạn Design: fallback an toàn hoặc báo lỗi cấu hình) và KHÔNG để rơi vào trạng thái dữ liệu không nhất quán âm thầm.
3. WHEN tài liệu/cấu hình môi trường được cập nhật THEN ràng buộc về replica set SHALL được ghi nhận để môi trường phát triển và production cấu hình phù hợp.

### Requirement 6: Khả năng kiểm thử

**User Story:** Là lập trình viên, tôi muốn có kiểm thử chứng minh tính nguyên tử và an toàn cạnh tranh, để tự tin rằng tính năng hoạt động đúng.

#### Acceptance Criteria

1. WHEN bộ kiểm thử chạy THEN hệ thống SHALL có test xác minh rằng khi một bước ghi thất bại, không có thay đổi MongoDB nào tồn tại lại (atomicity).
2. WHEN bộ kiểm thử chạy THEN hệ thống SHALL có test mô phỏng đặt hàng đồng thời để xác minh tồn kho không xuống dưới 0.
3. WHEN bộ kiểm thử chạy THEN hệ thống SHALL có test xác minh tồn kho flash sale trên Redis được hoàn lại khi transaction MongoDB bị abort.
