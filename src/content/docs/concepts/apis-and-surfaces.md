---
title: "APIs and surfaces"
description: "REST, gRPC, and the planned Trino SQL surface — when and why to use each."
sidebar:
  order: 40
---

Cyoda has two API surfaces in cyoda-go, REST and gRPC, and a third, Trino
SQL, that is planned. Picking the right one for the job matters; the surfaces
are not equivalent, and each carries different guarantees.

## Three surfaces

- **REST** — the default surface for your application's backend, background
  jobs and administrative tooling. CRUD over entities, search, workflow
  invocations, schema management.
- **gRPC** — the surface for compute. External processors and criteria
  services connect to the platform over gRPC, receive work, and return
  results. Supports bidirectional streaming.
- **Trino SQL** — the planned surface for analytics: cross-entity queries,
  reporting, JDBC connections, BI tools, against a Trino catalogue that
  projects entities into virtual SQL tables. Not yet implemented in
  cyoda-go.

## Which surface, when?

- Building the backend behind a UI, an admin tool, or a sync integration?
  **REST.**
- Writing a processor or criterion that runs against transitions? **gRPC.**
- Running analytics, reports, or ad-hoc queries across many entities?
  **Trino SQL**, once it is implemented; until then, use
  [search](/build/searching-entities/).

REST and gRPC are backed by the same entity store. A transition recorded via
REST is visible to gRPC compute nodes, with the same audit trail behind it.

Every call on either surface carries a bearer token that Cyoda signed,
normally issued to an M2M client, and every data operation requires
`ROLE_M2M`. Browsers and mobile
apps do not call Cyoda: your backend authenticates your users and calls Cyoda
for them through an on-behalf-of client. See
[Authentication and identity](/concepts/authentication-and-identity/).

## REST: services that speak to the platform

Use REST when the call represents *your application interacting with the
platform as a whole*, for itself or for one of its users: creating an order,
searching for customers, reading audit history, managing a workflow
definition. This is the surface your backend, your admin tooling, and most
external integrations will use.

REST is synchronous and versioned. Each request carries a Cyoda token as
`Authorization: Bearer`: an on-behalf-of token when the backend acts for a
signed-in user, the client's own token otherwise. The full endpoint
catalogue lives in the [API reference](/reference/api/).

## gRPC: external processors that speak for the platform

Use gRPC when your code is *a compute node acting on behalf of a workflow
transition*. A compute node holds a bidirectional stream open to the
platform. Processors, function criteria and schedule functions attached to a
workflow are dispatched over that stream as callouts, and the node streams
its results back. This is how your own code runs inside a workflow.

- **Audit.** Every callout belongs to the transition that dispatched it,
  inside the platform's audit trail.
- **Credentials.** Each compute-node service connects with its own plain M2M
  client and a `client_credentials` token. The platform does not hand
  credentials to compute nodes. Callbacks into Cyoda use the same client's
  token.
- **Identity.** Each callout carries `authtype`/`authid`, the principal the
  work is for, and `authexectype`/`authexecid`, the principal that executes
  it. A compute node that needs to know who acted reads both.
- **Streaming.** High-throughput workloads benefit from streaming both
  ways.

For how to implement a compute node, see
[Build → client compute nodes](/build/client-compute-nodes/).

## Trino SQL: cross-entity analytics

:::caution[Upcoming]
Trino SQL is not yet implemented in cyoda-go; see [cyoda-go#382](https://github.com/Cyoda/cyoda-go/issues/382). The section below documents the planned surface; names and shapes may change before release.
:::

Use Trino when the question is *analytical* — joins across entity types,
aggregates, reporting, time-series. Every entity model is projected into a
set of virtual SQL tables; nested arrays and objects expand into separate
tables so relational queries remain natural.

Typical uses:

- Ad-hoc analysis against live data in a notebook or BI tool.
- Scheduled reports that aggregate entities across a tenant.
- Historical queries using the `point_time` column for as-of reads.

The table generation rules, data-type mappings, JDBC connection patterns,
and handling of polymorphic fields are in the
[Trino SQL reference](/reference/trino/). For the Build-side quickstart —
connection recipe, first query, performance notes — see
[Analytics with SQL](/build/analytics-with-sql/).
