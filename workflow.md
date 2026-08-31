# Issue #47 Workflow: Implement Admin API Endpoint to Fetch Active Disputes for Dashboard

## 📌 Overview
This document details the step-by-step workflow for implementing issue **#47 Backend: Implement Admin API endpoint to fetch all active disputes for dashboard** in `SwiftChain_Backend`.

---

## 🎯 Goal & Requirements
- **Endpoint**: `GET /api/v1/admin/disputes`
- **Authentication & Authorization**: Protected with `authenticate` middleware and `requireRole(UserRole.ADMIN)` middleware.
- **Filtering**: Supports status filter (`open`, `under_review`, `resolved`, `rejected`, `active`, `all`). Defaults to **active disputes** (`open` & `under_review`) when the `status` query parameter is omitted.
- **Pagination**: Supports `page` (default `1`) and `limit` (default `10`, max `100`).
- **Layered Architecture**: Strict `Controller -> Service -> Model` pattern.

---

## 🏗️ Architecture & Changes

### 1. Data Layer (`Model`)
- Utilizes the existing `Dispute` Mongoose model located at [Dispute.ts](file:///c:/Users/Bamsy/SwiftChain_Backend/src/models/Dispute.ts).
- Queries real database records via Mongoose methods (`Dispute.find` and `Dispute.countDocuments`).

### 2. Service Layer (`Service`)
- Added `getAdminDisputes` in [adminService.ts](file:///c:/Users/Bamsy/SwiftChain_Backend/src/services/adminService.ts).
- Defined TypeScript DTO interfaces `GetAdminDisputesInput` and `GetAdminDisputesResult`.
- Applied filtering logic:
  - Default / `active`: `{ status: { $in: ['open', 'under_review'] } }`
  - `all`: `{}` (unfiltered by status)
  - Specific status (`open`, `under_review`, `resolved`, `rejected`): `{ status }`
  - Invalid status: Throws `AppError` with status code `400 Bad Request`.
- Implemented pagination calculation (`skip = (page - 1) * limit`, `totalPages = Math.ceil(total / limit)`).

### 3. Controller Layer (`Controller`)
- Added `getDisputes` in [adminController.ts](file:///c:/Users/Bamsy/SwiftChain_Backend/src/controllers/adminController.ts).
- Validated numeric `page` and `limit` query parameters.
- Invoked `getAdminDisputesService` and returned response format:
  ```json
  {
    "status": "success",
    "data": [ /* list of dispute documents */ ],
    "pagination": {
      "total": 2,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

### 4. Routing & Documentation (`Route`)
- Registered `GET /disputes` in [adminRoutes.ts](file:///c:/Users/Bamsy/SwiftChain_Backend/src/routes/adminRoutes.ts).
- Mounted under `/api/v1/admin/disputes` with authentication and admin role verification automatically inherited.
- Added OpenAPI / Swagger JSDoc annotations.

---

## 🧪 Testing & Verification
- Created unit & integration test suite in [adminDisputes.test.ts](file:///c:/Users/Bamsy/SwiftChain_Backend/tests/adminDisputes.test.ts).
- **Test Scenarios Covered**:
  1. `200 OK`: Default request returns active disputes (`OPEN` and `UNDER_REVIEW`).
  2. `200 OK`: Filtering by status (`resolved`, `all`, etc.).
  3. `200 OK`: Pagination handling (`page` & `limit`).
  4. `400 Bad Request`: Invalid status filter or invalid page/limit parameters.
  5. `401 Unauthorized`: Request missing JWT token.
  6. `403 Forbidden`: Non-admin role attempting access.

---

## 🚀 Branch & PR Reference
- **Branch**: `feat/admin-fetch-disputes`
- **Issue**: Closes #47
