# Stuffy Supermarket Backend OpenAPI 3.0 Specification

Below is the complete OpenAPI 3.0 spec detailing the core endpoints, parameters, and payloads for the Stuffy Supermarket backend API.

```yaml
openapi: 3.0.3
info:
  title: Stuffy Supermarket API
  description: Core backend service APIs for Stuffy Supermarket, including Multi-Seller operations, Logistics fulfillment, Escrow guarantee return mediation, Promotions rules, Socket live virtual gifting, and Web3 loyalty authentication.
  version: 1.0.0
servers:
  - url: http://localhost:5000/api
    description: Local development API server
  - url: https://stuffy-backend-api.onrender.com/api
    description: Production API server
paths:
  /auth/register:
    post:
      summary: Register a new buyer or seller user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                email:
                  type: string
                password:
                  type: string
                role:
                  type: string
                  enum: [user, seller]
                  default: user
              required:
                - name
                - email
                - password
      responses:
        '201':
          description: User registered successfully. Email verification token logged in mock console.
        '400':
          description: Invalid request or email already exists.

  /auth/verify/{token}:
    get:
      summary: Verify user email using verification token
      parameters:
        - name: token
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Returns HTML verification success page.
        '400':
          description: Token invalid or expired.

  /products:
    get:
      summary: Retrieve products with pagination, search, sorting and category filtering
      parameters:
        - name: pageNumber
          in: query
          schema:
            type: integer
            default: 1
        - name: keyword
          in: query
          schema:
            type: string
        - name: category
          in: query
          schema:
            type: string
        - name: sortBy
          in: query
          schema:
            type: string
            enum: [newest, price_asc, price_desc, rating, popular]
      responses:
        '200':
          description: Paginated list of products

    post:
      summary: Create a new product (Requires Seller or Admin role)
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                price:
                  type: number
                category:
                  type: string
                countInStock:
                  type: integer
                shop:
                  type: string
      responses:
        '201':
          description: Product created successfully

  /orders:
    post:
      summary: Create order with auto-splitting by Shop ID and Escrow Lock
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                orderItems:
                  type: array
                  items:
                    type: object
                    properties:
                      product:
                        type: string
                      qty:
                        type: integer
                      price:
                        type: number
                shippingAddress:
                  type: object
                paymentMethod:
                  type: string
                selectedCarriers:
                  type: object
      responses:
        '201':
          description: Split order documents created successfully

  /orders/{id}/dispute/respond:
    put:
      summary: Seller responds to buyer's escrow dispute request
      security:
        - BearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                action:
                  type: string
                  enum: [accept, reject]
      responses:
        '200':
          description: Dispute action accepted.

  /orders/{id}/dispute/resolve:
    put:
      summary: System Administrator resolves a disputed order escrow
      security:
        - BearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                decision:
                  type: string
                  enum: [refund_buyer, release_to_seller]
      responses:
        '200':
          description: Dispute resolved successfully.

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```
