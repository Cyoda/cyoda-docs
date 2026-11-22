---
title: "Authentication and identity"
description: "Who can call Cyoda, how an application acts for its users, and how every change records both the user it was for and the client that made it."
sidebar:
  order: 50
---

Only **machine-to-machine (M2M) clients** connect to Cyoda. Your users never
call Cyoda directly. They sign in to your application. Your application
decides what each user may do, then calls Cyoda for them. Cyoda records the
user the application names and the client that made each call.

Cyoda has no per-user permissions and holds no user sessions. It does not
verify the user an application names; it records what the client states.
Like a database, Cyoda cannot protect data from an application that is itself
compromised, so authorization of users stays in your application.

There is one exception to "only clients connect". The platform operator can
sign a short-lived token offline with `cyoda token`, using the deployment's
signing key. That is how the first admin token of a tenant comes into being.

## Tokens are signed by Cyoda

Every API call carries an `Authorization: Bearer <jwt>` header with a token
that Cyoda signed with one of its own key pairs. Cyoda issues these tokens to
M2M clients at a tenant-scoped token endpoint,
`POST /api/tenants/{tenant}/oauth/token`. Each token names the tenant
(`caas_org_id`), the principal, and the roles that authorization is evaluated
against. A token from an identity provider is refused with `401`. So is a
user assertion presented as a bearer token.

Tokens are short-lived: 300 seconds by default and never more than an hour.
There is no refresh token. A client fetches a new token when the old one is
close to expiry.

## Machine-to-machine credentials

An M2M client is a client id and a secret that belong to one **tenant**. The
tenant admin creates clients through the IAM admin API. The client id is
unique within the tenant and can be chosen at creation. The secret is shown
once and can be reset, but never read again.

There are three kinds of client. Each kind uses one grant:

| Client | Roles | Grant | Typical use |
| --- | --- | --- | --- |
| Plain | `ROLE_M2M` | `client_credentials` | Background jobs, scripts, compute nodes |
| Admin | `ROLE_M2M`, `ROLE_ADMIN` | `client_credentials` | Provisioning the tenant's clients and trusted keys |
| On-behalf-of | `ROLE_M2M` | token exchange | A backend that calls Cyoda for its signed-in users |

The client authenticates to the token endpoint with HTTP Basic. A plain or
admin client receives a token of its own, and its changes are recorded as the
client's. Give each deployable part of an application (the backend, each
compute-node service, each job) its own client. That way it can be rotated or
revoked on its own, and the recorded executor names the part that made each
change.

`ROLE_M2M` is the only data permission. It reaches every data operation in
the tenant, model and workflow import included. Treat every client secret as
access to all of the tenant's data.

## On-behalf-of exchange

An **on-behalf-of client** acts for your application's users. It never uses
`client_credentials`. Instead:

1. A tenant admin registers a **trusted key**: an RSA public key whose
   private half stays with your backend.
2. For each user, your backend signs a short **user assertion**. This is a
   JWT whose `sub` is the user id, `caas_org_id` is the tenant, and `aud` is
   Cyoda's issuer (`CYODA_JWT_ISSUER`, default `cyoda`). It lives at most 300
   seconds. The `kid` header names the trusted key.
3. The on-behalf-of client exchanges the assertion at the token endpoint
   (RFC 8693 token exchange) and receives a Cyoda token for that user.

The issued token's subject is the user, and its `act` claim names the client.
It carries the **client's** roles, never the user's: any role claim in the
assertion is ignored. An on-behalf-of token reaches data operations only. It
never administers clients or keys, and it never opens a compute-node stream.

The trusted key is used only to verify the assertion during the exchange.
Cyoda does not accept the assertion, or any token it did not sign, on an API
call.

## Roles and administration

- **`ROLE_M2M`.** Every data operation over HTTP and gRPC requires it. A token
  without it gets `403 FORBIDDEN` (gRPC `PermissionDenied`) before the
  operation runs.
- **`ROLE_ADMIN`, tenant admin.** Manages the tenant's M2M clients and trusted
  keys.
- **Platform operator.** `ROLE_ADMIN` in the tenant named `PLATFORM`. Manages
  the cluster's signing key pairs, the platform clock, cluster status and the
  `/admin/*` runtime controls. No other tenant's admin can touch them.

A tenant has no registry entry. It exists as soon as a token names it, and
only the operator's `cyoda token --tenant <id>` can name a new tenant: a
client's token always carries the client's own tenant.

## Principal kinds

Every principal has an explicit **kind**: `user`, `service` or `system`. The
kind is recorded when the principal is established, never inferred from the
roles it carries.

- `user`: a person. This is the user named in an on-behalf-of token, or the
  operator's `cyoda token`.
- `service`: an M2M client acting as itself.
- `system`: Cyoda itself, the executor of a scheduled transition firing.

The user id `system` is reserved in any letter case, so no caller can be
recorded as the platform's own principal. Compute nodes receive the kinds on
every callout. Dispatch fails closed: Cyoda sends no callout when either
principal has no id or an unrecognized kind.

## Attribution is not authorization

Some actions happen because of a user, but not *as* that user. Examples are a
processor writing other entities in reaction to someone's transition, a
compute node writing back inside the user's transaction, or a scheduled
transition firing hours after the request that armed it.

Cyoda keeps the two concerns apart, and records both:

- The **attributed principal** is who the change is for: the user of an
  on-behalf-of request, otherwise the caller. For a cascade it is the
  transaction's origin, carried unchanged through every joined write. For a
  scheduled firing it is the principal that armed the timer.
- The **executor** is who actually made the change: the M2M client whose
  token made the call, `system` for a scheduled firing, or the operator for a
  `cyoda token` request.

What a follow-on action may do depends on the executor's roles, never on the
user it is attributed to. The origin is set by the platform only. No request
field and no compute node can declare it, so attribution cannot be spoofed by
a caller.

Both principals appear wherever Cyoda records a change. Entity change history
carries `user`, `attributedKind` and `executedBy`
(see [the change history](/build/working-with-entities/#change-history)).
Audit events carry `actor` and `executedBy`. Callouts carry
`authtype`/`authid` for the attributed principal and
`authexectype`/`authexecid` for the executor. A user-attributed change is
therefore never indistinguishable from a direct user action: a check that
means "this user approved now" also checks that the executor is your
backend's on-behalf-of client.

## Where to go next

- [Authenticating your application](/build/authenticating-applications/)
  walks through the whole integration step by step: clients, trusted keys,
  the exchange, compute nodes and rotation.
- [Identity and IAM](/reference/identity-and-iam/) is the reference for the
  token endpoint, the admin endpoints and the configuration that governs
  them.
- [`cyoda help auth`](/help/auth/) is the canonical reference in the binary,
  with every claim and every error.
