---
title: "Status and roadmap (Cyoda Cloud)"
description: "Where the Cyoda Cloud rebuild stands and what is coming next."
sidebar:
  order: 30
---

## Current status

<!--
ABOUTME: Quick reference giving a concise overview of where the Cyoda Cloud rebuild stands.

THIS SECTION NEEDS TO BE AS COMPACT AND CONCISE AS POSSIBLE, BECAUSE IT IS SHOWN AS A PANEL ON VARIOUS UIs

TONE: Direct, scannable format. Use the first-person plural form and keep the tone conversational and friendly.
-->

**🏗️ Rebuilding** — We are rebuilding Cyoda Cloud on
[cyoda-go](https://github.com/Cyoda/cyoda-go), and we are
currently at the **design stage** of the new architecture. There is no
hosted service to sign up for yet.

What's true today:

| Area | Status |
|---|---|
| **Architecture** | New multi-tenant design (managed cyoda-go cores, isolated Postgres per environment, client-owned compute nodes) is in active design. See the [Cyoda Cloud overview](/cyoda-cloud/). |
| **Local development** | Fully available now. [cyoda-go](https://github.com/Cyoda/cyoda-go) is Apache-2.0 OSS and runs on your machine — everything you build will carry over to the cloud unchanged. See [Run](/run/). |
| **CLI** | [cyoda-cloud-cli](https://github.com/Cyoda/cyoda-cloud-cli) is established and will be developed in the open alongside the control plane. |
| **Identity & entitlements** | Design we're working towards is documented at [Identity and entitlements](./identity-and-entitlements/). |

**⭐ Star [cyoda-cloud-cli](https://github.com/Cyoda/cyoda-cloud-cli)** to tell us you want Cyoda Cloud built, and **[join the waitlist](https://cyoda.com/cloud)** for early access.

**Reach out to us on [Discord](https://discord.com/invite/95rdAyBZr2)** with questions or feedback — design-stage input has the most leverage.

## Roadmap

In order, deliberately coarse while the design settles:

1. **Design** *(we are here)* — multi-tenant architecture, control
   plane, provisioning model, identity and entitlements.
2. **Control plane and provisioning** — environment lifecycle behind
   one versioned API, with the dashboard and
   [cyoda-cloud-cli](https://github.com/Cyoda/cyoda-cloud-cli)
   as peer front ends.
3. **Early access** — first hosted environments for waitlist members.
4. **General availability** — self-service signup, subscription tiers,
   and the [dedicated and enterprise tiers](/cyoda-cloud/#tiers) beyond
   the shared tier.

We'll keep this page and [Discord](https://discord.com/invite/95rdAyBZr2)
updated as milestones land.
