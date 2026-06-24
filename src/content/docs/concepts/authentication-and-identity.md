---
title: "Authentication and identity"
description: "OAuth 2.0 tokens, machine-to-machine credentials, on-behalf-of exchange, and external key trust — conceptually."
sidebar:
  order: 50
---

Cyoda is an OAuth 2.0 authorization server. All traffic to the platform — REST,
gRPC, Trino — is authenticated with bearer tokens the platform issues. This
page explains the identity concepts; the mechanics of configuring an IdP,
rotating keys, and provisioning credentials live under Run.

## The platform issues tokens

Every request carries a JWT bearer token. Cyoda both **issues** tokens (as an
OAuth 2.0 authorization server) and **validates** them on every API call. The
token encodes the subject, the scopes, and the tenant the request belongs to;
authorization is evaluated from the token, not from transport-level
credentials.

Clients obtain a token through an OAuth 2.0 flow appropriate to their role:
end-user flows for people, M2M flows for services, on-behalf-of exchange for
downstream calls.

## Machine-to-machine credentials

Services authenticate to Cyoda using **client credentials** (`client_id` and
`client_secret`). The platform issues tokens to those credentials and enforces
the scopes associated with the service account. Use M2M credentials for any
automated integration: ingest pipelines, compute nodes, back-office workers.

Rotate credentials like any other secret; the lifetime and rotation cadence
are enforced per environment.

## On-behalf-of exchange

When one service calls another on a user's behalf — a web app calling an API
that calls a processor, for example — Cyoda supports **token exchange**. The
calling service presents its own token plus the user's token and receives a
new token scoped to the downstream call. This preserves the user identity
through the chain without passing the original bearer token around. In
practice, the calling service includes the user's JWT as the `subject_token`
in a token-exchange request; the issued token carries both identities for
downstream authorization.

The result: the audit trail records who the original user was at every hop,
and each service still only sees a token scoped to what it is allowed to do.

## External key trust

Cyoda can be configured to **trust tokens issued by an external IdP** — your
corporate Okta, Auth0, or Keycloak, for example. The platform accepts tokens
signed with keys it recognises, maps the external subject to an internal
identity, and applies the local authorization rules. Users sign in with their
organisation's single sign-on and receive entitlements within Cyoda.

External key trust is configured per environment; the list of trusted signers
and the subject-to-identity mapping are part of the tenant's identity
configuration.

## Where this is configured

- **Self-hosted (cyoda-go).** Identity configuration — bootstrap credentials,
  JWT signing keys, external IdP trust — is managed via cyoda-go
  configuration. See the
  [cyoda-go authentication reference](https://github.com/Cyoda/cyoda-go#authentication)
  for the authoritative parameter list.
- **Cyoda Cloud.** Identity is surfaced as a managed service:
  [Cyoda Cloud → identity and entitlements](/cyoda-cloud/identity-and-entitlements/).

## What your application does

Applications do not implement OAuth 2.0 flows from scratch; they fetch a token
using their client credentials (or accept one from a user session) and attach
it to every Cyoda call. See [Build → working with entities](/build/working-with-entities/)
for the client patterns.
