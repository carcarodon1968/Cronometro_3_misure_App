# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Any path not explicitly matched under `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Ownership**: Every document in `/sessions/{sessionId}` must belong to a signed-in user with `request.auth.token.email_verified == true` and `ownerId == request.auth.uid`.
3. **Path Variable & Key Hardening**: `sessionId`, `id`, `recordId`, and `ownerId` must match `^[a-zA-Z0-9_\-]+$` with length between 1 and 128 characters, and `incoming().id == sessionId`.
4. **Strict Schema & Zero Shadow Fields**: `isValidSession(data)` enforces both `data.keys().hasAll(...)` and `data.keys().hasOnly(...)` on every create and update, ensuring no unvalidated or extra properties can be injected.
5. **Temporal & Ownership Immutability**: On `create`, `createdAt == request.time` and `updatedAt == request.time`. On `update`, `ownerId`, `id`, `recordId`, and `createdAt` are strictly immutable (`incoming().field == existing().field`) and `updatedAt == request.time`.
6. **Query Enforcement**: `allow list` on `/sessions/{sessionId}` enforces `resource.data.ownerId == request.auth.uid` without `get()`/`exists()` calls, preventing cross-tenant data scraping and O(n) read amplification.

## 2. The "Dirty Dozen" Payloads (All Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Write**: `auth = null`, creating a session in `/sessions/sess_1`.
2. **Unverified Email Write**: `auth = { uid: 'user_1', token: { email_verified: false } }`, creating a session.
3. **Identity Spoofing on Create**: `auth.uid = 'user_1'`, payload has `ownerId: 'user_2'`.
4. **Shadow Field Injection on Create**: Valid payload plus `"isAdmin": true`.
5. **ID Path Poisoning**: Document path `/sessions/invalid$id!with*chars` or >128 chars.
6. **Mismatched Document ID**: Path `/sessions/user_1_s1` with payload `id: 'user_1_s2'`.
7. **Oversized String Payload (Denial of Wallet)**: `notes` field with 2,000 characters (`> 500`).
8. **Negative or Out-of-Bounds Numeric Values**: `finalAverage: -50` or `count: 99`.
9. **Client-Spoofed `createdAt` Timestamp**: `createdAt` set to a past/future timestamp instead of `request.time`.
10. **Ownership Transfer on Update**: Updating `ownerId` from `'user_1'` to `'user_2'`.
11. **Immutable `createdAt` Mutation on Update**: Changing `createdAt` during an update.
12. **Cross-Tenant List Scraping**: Authenticated `user_2` executing an unconstrained list query or reading `user_1`'s document.

## 3. Test Runner
See `/firestore.rules.test.ts` for the complete test suite verifying that all 12 adversarial payloads return `PERMISSION_DENIED`.
