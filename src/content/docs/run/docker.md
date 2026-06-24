---
title: "Docker"
description: "Run cyoda-go in Docker for bespoke integrations and local compositions."
sidebar:
  order: 20
---

Docker is the right packaging when you need cyoda-go to sit inside a larger
composition — with your app, with a PostgreSQL backend, with an observability
stack — or when your CI pipeline wants a clean container image per run.

## When Docker fits

- **Bespoke integrations.** Deploy cyoda-go alongside your own services on a
  single host, wire them over a Docker network.
- **Composed environments.** Run cyoda-go with PostgreSQL, Prometheus,
  Grafana, and OpenTelemetry collectors as a complete local stack.
- **PostgreSQL for dev and test.** Point cyoda-go at a containerised
  PostgreSQL to exercise production-mode behaviour locally before
  deploying.
- **CI pipelines.** Ephemeral, reproducible, no host state.

## Image

cyoda-go publishes container images per release. The authoritative reference
and pull instructions live in the
[cyoda-go Docker reference](https://github.com/Cyoda/cyoda-go/tree/main/deploy/docker).

## Compose example

The repository ships a minimal `compose.yaml` for getting a single node and
PostgreSQL up, plus a richer
[compose-with-observability](https://github.com/Cyoda/cyoda-go/tree/main/examples/compose-with-observability)
example that wires tracing and metrics.

Use these as templates rather than retyping them here — they track the
cyoda-go release and we link whichever is current.

## PostgreSQL backend

Point cyoda-go at a PostgreSQL instance by setting `CYODA_STORAGE_BACKEND=postgres`
and the usual connection variables (or `*_FILE` forms for secrets). The DSN
goes in `CYODA_POSTGRES_URL` (or `CYODA_POSTGRES_URL_FILE` for a file-mounted
secret per Docker conventions). The Docker compose example wires this up
end-to-end; for production you will run PostgreSQL separately and pass only
the DSN.

## Observability

The container emits structured logs to stdout, exposes a Prometheus scrape
endpoint for metrics, and accepts OpenTelemetry configuration for traces.
The observability example demonstrates a full loop:

- **Logs** — stream from the cyoda-go container.
- **Metrics** — Prometheus scrapes the admin port.
- **Traces** — OTLP exporter configured via environment.

Tune sampling and log level at runtime via the admin endpoints;
see the
[cyoda-go observability reference](https://github.com/Cyoda/cyoda-go#observability).

Health probes live on the admin port (default 9091): `/livez` (liveness) and
`/readyz` (readiness). Both are unauthenticated.

## Data directory

The container pre-stages `/var/lib/cyoda` as the data directory (with the
correct ownership for the non-root `65532:65532` user). Mount it as a named
volume if you want SQLite data or any plugin state to persist across
container restarts.

