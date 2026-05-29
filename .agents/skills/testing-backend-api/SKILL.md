---
name: testing-backend-api
description: Test the Stuffy Supermarket backend API end-to-end. Use when verifying backend route changes, middleware fixes, or database integration.
---

# Testing the Stuffy Supermarket Backend API

## Prerequisites

### Infrastructure (Docker)
The backend requires MongoDB and Redis. Start them as Docker containers:
```bash
docker run -d --name stuffy-mongo -p 27017:27017 mongo:latest
docker run -d --name stuffy-redis -p 6379:6379 redis:alpine
```

RabbitMQ is optional — the app handles its absence gracefully. Only needed for inventory sync and event-driven features.

### Install Dependencies
```bash
cd backend-api && npm install
# Or from root: npm install (uses workspaces)
```

### Start the Backend
```bash
cd backend-api
MONGO_URI=mongodb://localhost:27017/stuffy_test REDIS_URL=redis://localhost:6379 npx ts-node-dev --respawn --transpile-only server.ts
```
- Default port: 5000. Set `PORT=xxxx` to change.
- Verify boot by checking logs for: `[Server] Listening on port 5000`, `[Redis] Connection established`, `[MongoDB] Connection established`
- Sentry DSN warning is harmless (placeholder DSN in code).

## Known Issues

### CJS/ESM Interop in routes/auth.js
The auth route files (`routes/auth.js`, `routes/cart.js`, `routes/orders.js`) use `require()` (CommonJS) but the models are `.ts` files with `export default` (ESM). When running via `ts-node-dev`, `require('../models/User')` may return `{ default: Model }` instead of `Model` directly, causing `User.findOne is not a function`.

**Workaround**: Seed test users directly via a Node.js script using `mongoose` and generate JWT tokens manually:
```javascript
const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: userId }, 'fallback_secret_stuffy', { expiresIn: '1h' });
```

### Auth Flow
- JWT secret: `process.env.JWT_SECRET || 'fallback_secret_stuffy'`
- Token delivery: Set as httpOnly cookie (`jwt`) AND accepted via `Authorization: Bearer <token>` header
- First registered user automatically gets `admin` role
- Auth middleware (`middleware/auth.ts`) checks Bearer header first, then cookie

## Testing API Routes

### Authentication
Use Bearer token in curl:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/...
```

### Key Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | Public | Register user |
| POST | /api/auth/login | Public | Login |
| PUT | /api/auth/profile | User | Update name (returns updated user + new token) |
| PUT | /api/auth/password | User | Change password (requires `currentPassword` + `newPassword`) |
| GET | /api/products | Public | List products (supports `sortBy`, `minPrice`, `maxPrice`, `minRating`, `category`, `keyword`) |
| GET | /api/products/:id | Public | Get single product |
| POST | /api/products | Admin | Create product |
| PUT | /api/products/:id | Admin | Update product (uses `??` so price=0 is valid) |
| DELETE | /api/products/:id | Admin | Delete product |
| POST | /api/products/:id/reviews | User | Submit review (one per user per product) |
| POST | /api/orders | User | Create order (decrements `countInStock` atomically) |
| GET | /api/orders | Admin | List all orders (paginated: `{orders, page, pages, total}`) |
| GET | /api/orders?status=X | Admin | Filter orders by status |
| GET | /api/orders/:id | Admin | Get order detail |
| PUT | /api/orders/:id/status | Admin | Update order status (validates: Pending/Processing/Shipped/Delivered/Cancelled) |
| GET | /api/vouchers | Public | List active vouchers |
| POST | /api/vouchers/claim | User | Claim a voucher by code (one per user) |
| POST | /api/vouchers/apply | User | Apply voucher to order (validates min order, calculates discount) |
| POST | /api/vouchers | Admin | Create new voucher |

### Product Query Parameters
- `sortBy`: `newest`, `price_asc`, `price_desc`, `rating`, `popular`
- `minPrice` / `maxPrice`: number (filters products by price range)
- `minRating`: number
- `category`: string
- `keyword`: string (search by name)

### Product Schema (required fields for creation)
```json
{"name": "string", "price": number, "category": "string"}
```
Optional: `description`, `image`, `countInStock` (have defaults).

### Response Shapes
- GET /api/products: `{products: [...], page: N, pages: N, total: N, categories: [...]}` (NOT a raw array; includes `categories` array)
- Auth routes: `{_id, name, email, role, token}` (NOT wrapped in `{user: ...}`; token included for localStorage)
- PUT /api/auth/password: `{message: "Password updated successfully"}` on success; 401 on wrong current password
- Reviews: POST returns `{message: "Review added"}` (201), duplicate returns `{error: "Product already reviewed by this user"}` (400)
- Voucher claim: `{message, voucher}` on success; `{error: "already claimed"}` on duplicate
- Voucher apply: `{code, type, discountAmount, freeShipping, finalTotal}` — percentage discounts respect `maxDiscount`
- Orders: POST returns the order object with `status: "Pending"`; products' `countInStock` decremented by `qty`

### Testing Tips
- After dropping the database, **restart the backend** so seed data (products, vouchers) is re-created.
- **Prefer register/login endpoints for tokens over manual JWT workaround.** `POST /api/auth/register` and `POST /api/auth/login` return tokens that work with all protected routes. Tokens created via direct MongoDB insert + `jwt.sign()` may NOT work with the `protect` middleware because Mongoose `findById` requires documents created through the Mongoose model. Use the manual approach only as a last resort.
- **Order items require `image` field.** When creating orders via curl, include `"image":"test.jpg"` in each orderItem — the Order model requires it and will return a validation error without it.
- To test stock decrement: note `countInStock` before and after creating an order with a specific `qty`.
- To test stock restore on cancel: create order (stock decreases), then PUT status to `Canceled` (stock should restore). Cancel again — stock should NOT double-restore.
- To test stock guard: try ordering with `qty` > available `countInStock` — should get 400 "Insufficient stock".
- To test cache invalidation: PUT a product with `price: 0`, then GET it — if `??` fix works, price will be 0 (not the old price).
- **First registered user is admin.** On a fresh database, the first `POST /api/auth/register` call creates an admin user. Subsequent registrations get "user" role. Plan your test setup accordingly.

## Devin Secrets Needed
None required for local testing. All services use Docker containers with default configs.

## Frontend Testing Notes
Frontend MFEs use Webpack Module Federation. Testing individual MFEs in the browser requires ALL remote apps running simultaneously (container, product-app, header-app, cart-app, etc.). This is complex to set up locally. For frontend-specific fixes, consider:
1. Verifying the code change is correct via code inspection
2. Testing the underlying API that the frontend calls
3. If full UI testing is needed, use `docker-compose up` to start everything
