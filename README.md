# 🛒 Stuffy Supermarket - Elite Micro Frontends & AI Ecosystem

![Master Architecture](https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=1200&auto=format&fit=crop)

**Stuffy Supermarket** không chỉ là một ứng dụng thương mại điện tử; đây là một **Hệ sinh thái Enterprise SaaS** thế hệ mới, được xây dựng trên kiến trúc **Micro Frontends (MFE)** lộng lẫy và bộ não **Agentic AI**. Một giải pháp bán lẻ Elite với khả năng mở rộng (scalability) và khả năng phục hồi (resilience) tuyệt đối trên Cloud.

---

## 🏗️ Kiến trúc Tổng thể (Elite Mesh)

Dự án sử dụng mô hình **Distributed Monorepo** (chia nhỏ module tại Runtime, quản lý tập trung tại Build-time), giao tiếp qua **GraphQL Federation Gateway** và **Message Broker (RabbitMQ)**.

### 🧩 15+ Micro Frontends & Microservices Catalog:
| Module | Vai trò | Công nghệ | URL (Production) |
| :--- | :--- | :--- | :--- |
| **`container`** | **App Shell / Orchestrator**: Trái tim điều phối Registry & PWA. | Webpack MF, React | [Link](https://stuffy-container.onrender.com) |
| **`graphql-gateway`** | **Data Hub**: Hợp nhất dữ liệu từ tất cả các Subgraphs. | Apollo Gateway, OTEL | [Link](https://stuffy-graphql-gateway.onrender.com) |
| **`backend-api`** | **Core API (REST/GQL)**: Quản lý Auth, Products & Governance. | Node.js, MongoDB, Sentry | [Link](https://stuffy-backend-api.onrender.com) |
| **`store-app`** | **Elite Storefront**: Quản lý trạng thái chia sẻ (Elite State). | Zustand, Framer Motion | [Link](https://stuffy-store-app.onrender.com) |
| **`image-service`** | **Image Edge Service**: Tối ưu hóa WebP & Resizing thời gian thực. | Sharp, Redis, Crypto | [Link](https://stuffy-image-service.onrender.com) |
| **`recom-service`** | **AI Recom Service**: Gợi ý sản phẩm qua RabbitMQ & Redis. | Socket.IO, BullMQ | [Link](https://stuffy-recom.onrender.com) |
| **`design-system`** | **Shared Core**: Thư viện UI (Glassmorphism), Styles, Hooks. | Vanilla CSS, React | [Link](https://stuffy-design-system-app.onrender.com) |
| **`3d-viewer-app`** | **AR Component**: Trải nghiệm quan sát sản phẩm 3D thực tế ảo. | Three.js, React-Three-Fiber | [Link](https://stuffy-3d-viewer-app.onrender.com) |
| **...và các MFE khác** | `header`, `cart`, `admin`, `profile`, `marketing`, `support`. | React, Webpack MF | [Link-tương-ứng] |

---

## 🌟 Tính năng Elite & Khác biệt Kỹ thuật

### 🧠 1. Agentic AI Shopping Copilot (Google Gemini Inside)
*   Sử dụng **Google Gemini Core** để tư vấn sản phẩm cá nhân hóa.
*   **Contextual Search**: Tìm kiếm sản phẩm thông minh theo ngữ cảnh người dùng.

### 🔗 2. Web3 & Loyalty Gamification (Polygon Integration)
*   **NFT Connectivity**: Xác thực quyền sở hữu NFT (Stuffy Diamond VIP) trên mạng Polygon qua **Alchemy**.
*   **Dynamic Pricing Rule Engine**: Tự động áp dụng giảm giá "bí mật" 20% cho chủ sở hữu NFT tại Runtime.

### 🛡️ 3. Resilient Image Edge Proxy & Circuit Breaker
*   Toàn bộ ảnh sản phẩm được proxy qua **ResilienceService**.
*   Sử dụng **Circuit Breaker (Opossum)**: Nếu `image-service` gặp sự cố, hệ thống sẽ tự động chuyển sang nạp ảnh gốc (Unsplash) để bảo vệ trải nghiệm người dùng.

### 🚦 4. Distributed Governance Registry
*   Cấu hình MFE không còn bị "đóng cứng" trong mã nguồn. 
*   Quản trị viên có thể **chuyển phiên bản (Rollback/Switch)** MFEs ngay lập tức thông qua Database Registry mà không cần Re-deploy App Shell.

---

## 🛠️ Tech Stack & Infrastructure

-   **Frontend**: React 18, Webpack 5 (Module Federation), Zustand (State Management), Framer Motion (Animation).
-   **Backend**: Node.js (ESM), Express, Apollo Server (GraphQL Federation).
-   **Databases**: MongoDB (Persistence), Redis (High-Speed Cache, Rate Limiting).
-   **Messaging**: RabbitMQ (Asynchronous Tasks & Event Sync).
-   **Observability**: Sentry (Error Tracking), OpenTelemetry (Tracing), Honeycomb (Observability).
-   **DevOps**: Docker, GitHub Actions (CI/CD Matrix), Render (Cloud Hosting).

---

## 🏗️ Hướng dẫn Triển khai (Cloud - Render)

Để hệ thống hoạt động đầy đủ tính năng, bạn cần cấu hình các biến môi trường sau vào **Environment Group** trên Render của bạn:

### 🔑 Các Khóa Môi trường (Environment Variables):
-   `MONGO_URI`: URL kết nối MongoDB Atlas (Gói Free M0).
-   `REDIS_URL`: URL kết nối Redis từ Upstash (Sử dụng `rediss://` cho SSL).
-   `RABBIT_URL`: URL kết nối RabbitMQ từ CloudAMQP.
-   `GEMINI_API_KEY`: API Key lấy từ Google AI Studio.
-   `POLYGON_RPC`: RPC Endpoint từ Alchemy để đọc Blockchain.
-   `STUFFY_INTERNAL_SECRET`: Một chuỗi bí mật bất kỳ dùng cho Zero-Trust Auth.
-   `OTEL_EXPORTER_OTLP_ENDPOINT`: `https://api.honeycomb.io/v1/traces` (Nếu dùng Honeycomb).

---

## 🚀 Quy trình CI/CD (GitHub Actions)

Mọi thay đổi trên toàn bộ monorepo đều được kiểm soát bởi quy trình CI/CD Thông minh (Smart Pipeline) để tiết kiệm tài nguyên:
1.  **Smart Linter & Tests**: Tự động kiểm tra cú pháp và chạy bài test tích hợp mỗi khi có Pull Request.
2.  **Dynamic Matrix Build**: Tự động phân tích commit (Path-filtering) và CHỈ build Image cho những module có thay đổi mã nguồn.
3.  **Targeted Provisioning**: Kích hoạt **Render Deploy Webhooks** một cách chọn lọc, chỉ ra lệnh cập nhật Cloud cho những dịch vụ vừa được build lại.

---

## 🛡️ Cam kết Chất lượng
*   **100% Cloud-Synchronized**: Không còn bất kỳ đường dẫn `localhost` nào trong mã nguồn Production.
*   **Zero-Downtime Resilience**: Cơ chế tự phục hồi (Self-Healing) tích hợp trong mỗi Microservice.
*   **Enterprise Security**: Xác thực liên dịch vụ (Inter-service Auth) qua JWT Internal.

---

*Phát triển bởi đội ngũ Stuffy Supermarket Elite Developers. 🚀🛡️💎🎯*
