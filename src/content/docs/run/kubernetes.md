---
title: "Kubernetes"
description: "Deploy cyoda-go with the Helm chart for clustered PostgreSQL-backed production."
sidebar:
  order: 30
---

Kubernetes is the recommended production packaging for self-hosted cyoda-go.
The application is designed for active-active stateless deployment: three to
ten cyoda-go pods behind a load balancer, with PostgreSQL as the only
stateful dependency.

## When Kubernetes fits

- **Production workloads** that need high availability.
- **Multi-node clustering** with rolling upgrades and blue/green.
- **Horizontal scale** up to the PostgreSQL backend's limits (10+ stateless
  pods serving one PostgreSQL cluster is a comfortable envelope).
- **Enterprise operations** — GitOps, secrets management, service meshes.

## Deployment shape

```
          ┌─────────────┐
          │ Load        │
          │ Balancer    │
          └──────┬──────┘
                 │
        ┌────────┼────────┐
        │        │        │
   ┌────▼─┐ ┌────▼─┐ ┌────▼─┐
   │cyoda │ │cyoda │ │cyoda │   (stateless, 3–10 pods)
   │-go   │ │-go   │ │-go   │
   └────┬─┘ └────┬─┘ └────┬─┘
        │        │        │
        └────────┼────────┘
                 │
          ┌──────▼──────┐
          │ PostgreSQL  │  (the only stateful dependency)
          └─────────────┘
```

Every pod is identical; any pod can serve any request. There is no leader
election, no ZooKeeper, no etcd. Coordination happens through PostgreSQL's
SERIALIZABLE isolation for writes and a gossip protocol (HMAC-authenticated)
for membership, so concurrent writers never silently corrupt data.

The stateful backend is pluggable: PostgreSQL (OSS default) or the
commercial Cassandra storage engine. The pod topology and the application
contract are identical either way — only the storage plugin configuration
differs.

## Helm chart

cyoda-go ships a Helm chart under
[`deploy/helm`](https://github.com/Cyoda/cyoda-go/tree/main/deploy/helm).
The chart provisions the cyoda-go Deployment, a Service, a ConfigMap for
non-sensitive configuration, and Secret references for credentials.

The authoritative values reference lives under
[Reference → Helm values](/reference/helm/); the chart's own `values.yaml`
remains the runtime source of truth.

The Helm chart auto-generates the HMAC secret unless
`cluster.hmacSecret.existingSecret` is provided. GitOps deployments should
always set `existingSecret` to avoid Helm rendering a fresh secret on every
reconcile, which would cause inter-node auth to drift.

## High availability

- **Load balancer.** Any Kubernetes-native L4 or L7 will do; match the pod
  readiness probe to the one the chart exposes.
- **Readiness and liveness probes.** Both are wired by default; tune if
  your control plane has stricter latency budgets.
- **Pod Disruption Budgets.** Set a minimum available count that matches
  your replica count minus one so rolling upgrades and node drains do not
  take the service below quorum.

## Backup and restore

Backup is standard PostgreSQL tooling: `pg_dump`, continuous WAL archiving,
snapshot-based backups from your cloud provider. cyoda-go does not maintain
any state outside PostgreSQL, so a PostgreSQL restore brings the platform
back to that point in time in full.

## Upgrades and rollback

cyoda-go releases follow semantic versioning. For production:

- **Blue/green or canary.** Run the new version alongside the old, cut
  traffic over, retire the old.
- **Rolling upgrade.** Fine for minor releases; set `maxUnavailable: 0` so
  capacity never drops.
- **Schema migration ordering.** Check the release notes for whether a
  release requires a PostgreSQL schema migration step before the new binary
  starts serving. The Helm chart runs schema migrations as a
  pre-install/pre-upgrade hook; pod startup is blocked until migrations
  complete.

## Sizing

Sizing is driven by write volume more than read volume, because reads scale
horizontally across pods while writes are serialised through PostgreSQL.
Qualitative guide:

- **Small.** 3 pods, `db.small` (or equivalent), up to a few hundred
  transitions per second.
- **Medium.** 5–7 pods, dedicated PostgreSQL, low thousands of
  transitions per second.
- **Large.** 10 pods with PostgreSQL scaled up; at this point consider
  swapping to the commercial Cassandra storage engine (still on
  Kubernetes), or handing operations to Cyoda Cloud as a SaaS.

## Observability

The chart exposes a Prometheus scrape annotation on the pods and surfaces
the admin endpoints for log-level and tracing control. Standard
OpenTelemetry configuration applies; wire OTLP exporters via environment
variables in the Helm values.

## Scaling past PostgreSQL

At the upper end of the sizing guide, PostgreSQL's write throughput
becomes the bottleneck. Two paths past it — the application contract
is identical in both:

- **Swap to the commercial Cassandra storage engine, still on
  Kubernetes.** The licensable plugin replaces the PostgreSQL backend
  with a horizontally-scaling Cassandra-backed tier. The Helm chart,
  the pod topology, and the application code are unchanged — only the
  storage plugin configuration changes.
- **Hand operations to Cyoda Cloud** (coming soon) — the managed
  service that runs the stack for you, from shared Postgres up to the
  Cassandra-backed enterprise tier. Same application contract,
  different operational model.

See [Cyoda Cloud](/cyoda-cloud/) for the managed option; contact sales
for the commercial Cassandra plugin.
