---
title: "Client compute nodes"
description: "Patterns for processor and criteria services — implementation, registration, and lifecycle."
sidebar:
  order: 40
---

# 1. Architecture Overview

A **calculation member** is an external gRPC client that participates in entity workflow processing on the Cyoda platform. The platform delegates work to your client over a persistent bidirectional gRPC stream, and your client returns results on the same stream. For the rationale behind preferring gRPC over HTTP for compute nodes, see [APIs and surfaces](/concepts/apis-and-surfaces/).

```
┌──────────────────────┐         gRPC (bidirectional stream)         ┌─────────────────────────┐
│   Cyoda Platform     │ ◄──────────────────────────────────────────►│  Your Calculation       │
│                      │    CloudEvent (Protobuf, JSON payload)      │  Member (Client)        │
│  ┌────────────────┐  │                                             │                         │
│  │ Workflow Engine│  │  1. Client opens stream, sends Join         │  ┌───────────────────┐  │
│  │                │  │  2. Server responds with Greet              │  │ Business Logic    │  │
│  │  - Processors  │──┼──3. Server pushes Processing/Criteria reqs──┼──│                   │  │
│  │  - Criteria    │  │  4. Client returns responses                │  │ - Data transforms │  │
│  │                │  │  5. Keep-alive heartbeats (bidirectional)   │  │ - Criteria checks │  │
│  └────────────────┘  │                                             │  └───────────────────┘  │
└──────────────────────┘                                             └─────────────────────────┘
```

Three types of work can be delegated:

| Use Case | Description | Request Type | Response Type |
|---|---|---|---|
| **Processing** | Perform actions, such as transforming entity data during a workflow transition, performing CRUD ops on other entities, running reports, interacting with other systems, etc. | `EntityProcessorCalculationRequest` | `EntityProcessorCalculationResponse` |
| **Criteria Evaluation** | Evaluate a boolean condition (e.g., "should this transition fire?") | `EntityCriteriaCalculationRequest` | `EntityCriteriaCalculationResponse` |
| **Function** | Compute and return a declared typed value without mutating anything — currently the firing time of a [scheduled transition](/build/workflows-and-processors/#scheduled-transitions). Added in v0.8.3. | `EntityFunctionCalculationRequest` | `EntityFunctionCalculationResponse` |

## 1.1 Protocol Summary

- **Transport**: gRPC bidirectional streaming via `CloudEventsService.startStreaming`
- **Message format**: [CNCF CloudEvents](https://cloudevents.io/) Protobuf envelope with JSON `text_data` payload
- **Authentication**: Bearer JWT token in gRPC `Authorization` metadata header
- **Auth context propagation**: The platform attaches [CloudEvents Auth Context extension](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/authcontext.md) attributes to processor and criteria requests, identifying the principal whose action triggered the workflow (see [Section 9](#9-auth-context-on-incoming-requests))
- **Serialization**: All payloads are JSON-serialized inside CloudEvent `text_data` (not binary protobuf)

---

# 2. Prerequisites

## 2.1 Proto Definitions

Your client needs the following proto files to generate gRPC stubs:

- **`cloudevents.proto`** — The standard CloudEvents Protobuf message definition (package `io.cloudevents.v1`)
- **`cyoda-cloud-api.proto`** — The Cyoda service definition (package `org.cyoda.cloud.api.grpc`)

The service definition:

```protobuf
service CloudEventsService {
  rpc startStreaming(stream io.cloudevents.v1.CloudEvent) returns (stream io.cloudevents.v1.CloudEvent);
}
```

The CloudEvent message:

```protobuf
message CloudEvent {
  string id = 1;          // Unique event ID (UUID recommended)
  string source = 2;      // URI-reference identifying the event source
  string spec_version = 3; // Must be "1.0"
  string type = 4;        // Event type string (see Section 4)

  map<string, CloudEventAttributeValue> attributes = 5;

  oneof data {
    bytes binary_data = 6;
    string text_data = 7;       // ← Used by Cyoda (JSON payload)
    google.protobuf.Any proto_data = 8;
  }
}
```

## 2.2 JWT Authentication Token

Obtain a valid JWT Bearer token from the Cyoda IAM system (OAuth 2.0 client credentials flow). The token must contain:
- A valid `caas_org_id` claim (your legal entity ID)
- Valid user roles

The token is validated on every stream establishment. If the token expires during an active stream, the stream remains valid — re-authentication occurs only when a new stream is opened.

## 2.3 Dependencies (Java/Kotlin Example)

For JVM-based clients, the recommended dependencies are:

- `io.grpc:grpc-stub`, `io.grpc:grpc-protobuf`, `io.grpc:grpc-netty-shaded` — gRPC runtime
- `io.cloudevents:cloudevents-protobuf` — CloudEvents SDK Protobuf format support
- `io.cloudevents:cloudevents-core` — CloudEvents SDK core
- `com.fasterxml.jackson.core:jackson-databind` — JSON serialization

---

# 3. Connection Setup

## 3.1 Create the gRPC Channel

```java
ManagedChannel channel = ManagedChannelBuilder
    .forAddress("cyoda-host.example.com", 50051)
    .usePlaintext()           // Use .useTransportSecurity() for TLS in production
    .keepAliveTime(30, TimeUnit.SECONDS)
    .keepAliveTimeout(10, TimeUnit.SECONDS)
    .build();
```

**Production TLS**: In production, always use TLS. Replace `.usePlaintext()` with:
```java
    .useTransportSecurity()
    .sslContext(/* your SSL context */)
```

## 3.2 Attach JWT Credentials

Create a `CallCredentials` implementation that injects the `Authorization` header:

```java
CallCredentials callCredentials = new CallCredentials() {
    @Override
    public void applyRequestMetadata(RequestInfo requestInfo, Executor executor, MetadataApplier applier) {
        executor.execute(() -> {
            Metadata headers = new Metadata();
            headers.put(
                Metadata.Key.of("Authorization", Metadata.ASCII_STRING_MARSHALLER),
                "Bearer " + jwtTokenSupplier.get()  // Always fetch a fresh token
            );
            applier.apply(headers);
        });
    }
};
```

## 3.3 Create the Stub

```java
CloudEventsServiceGrpc.CloudEventsServiceStub asyncStub = CloudEventsServiceGrpc
    .newStub(channel)
    .withCallCredentials(callCredentials)
    .withWaitForReady();   // Wait for the channel to become ready before sending
```

---

# 4. CloudEvent Type System

Every message on the stream is a CloudEvent with a `type` field that determines how to deserialize the JSON `text_data`. Your client must handle the following types:

| CloudEvent `type` | Direction | Description |
|---|---|---|
| `CalculationMemberJoinEvent` | Client → Server | Register as a calculation member |
| `CalculationMemberGreetEvent` | Server → Client | Server confirms registration |
| `CalculationMemberKeepAliveEvent` | Bidirectional | Heartbeat probe and response |
| `EventAckResponse` | Server → Client | Acknowledgment of keep-alive |
| `EntityProcessorCalculationRequest` | Server → Client | Process entity data |
| `EntityProcessorCalculationResponse` | Client → Server | Return processed entity data |
| `EntityCriteriaCalculationRequest` | Server → Client | Evaluate a boolean criterion |
| `EntityCriteriaCalculationResponse` | Client → Server | Return criterion result |
| `EntityFunctionCalculationRequest` | Server → Client | Compute a typed value (no mutation) |
| `EntityFunctionCalculationResponse` | Client → Server | Return the typed result |

## 4.1 Building a CloudEvent

To send a CloudEvent on the stream (Java/Kotlin with CloudEvents SDK):

```java
// 1. Build the CloudEvents SDK event
io.cloudevents.CloudEvent sdkEvent = CloudEventBuilder.v1()
    .withType("CalculationMemberJoinEvent")   // Must match the type table above
    .withSource(URI.create("my-calculation-member"))
    .withId(UUID.randomUUID().toString())
    .withData(PojoCloudEventData.wrap(event, e -> objectMapper.writeValueAsBytes(e)))
    .build();

// 2. Serialize to Protobuf
EventFormat protobufFormat = EventFormatProvider.getInstance()
    .resolveFormat("application/cloudevents+protobuf");
byte[] protoBytes = protobufFormat.serialize(sdkEvent);

// 3. Parse to the gRPC CloudEvent message
io.cloudevents.v1.proto.CloudEvent grpcEvent =
    io.cloudevents.v1.proto.CloudEvent.parseFrom(protoBytes);
```

## 4.2 Parsing a Received CloudEvent

```java
// From the gRPC StreamObserver<CloudEvent>.onNext(value):
String eventType = value.getType();
String jsonPayload = value.getTextData();

// Deserialize based on type
switch (eventType) {
    case "CalculationMemberGreetEvent":
        GreetEvent greet = objectMapper.readValue(jsonPayload, GreetEvent.class);
        break;
    case "EntityProcessorCalculationRequest":
        ProcessorRequest req = objectMapper.readValue(jsonPayload, ProcessorRequest.class);
        break;
    // ... etc
}
```

---

# 5. Connection Lifecycle

## 5.1 Open the Stream

```java
StreamObserver<CloudEvent> requestObserver = asyncStub.startStreaming(
    new StreamObserver<CloudEvent>() {
        @Override
        public void onNext(CloudEvent value) {
            // Dispatch based on value.getType() — see Sections 6–8
        }

        @Override
        public void onError(Throwable t) {
            // Connection lost — trigger reconnect (see Section 12)
        }

        @Override
        public void onCompleted() {
            // Server closed the stream — trigger reconnect
        }
    }
);
```

## 5.2 Join Handshake

Immediately after opening the stream, send a `CalculationMemberJoinEvent`:

```json
{
  "id": "<uuid>",
  "tags": ["my-processor-tag", "production"]
}
```

**Tags** are critical for routing. The platform routes processing/criteria requests to members whose tags are a **superset** of the tags configured on the workflow processor/criterion. Tags are case-insensitive (lowercased server-side).

The server responds with a `CalculationMemberGreetEvent`:

```json
{
  "id": "<uuid>",
  "success": true,
  "memberId": "<server-assigned-member-uuid>",
  "joinedLegalEntityId": "<your-legal-entity-id>"
}
```

**Store the `memberId`** — you will need it for keep-alive messages.

If `success` is `false`, inspect the `error` object for the failure reason (e.g., subscription limit exceeded, invalid token).

### 5.3 Keep-Alive

The platform periodically probes your member with `CalculationMemberKeepAliveEvent` messages to verify liveness. You **must** respond to each probe with an `EventAckResponse`.

**Server-initiated keep-alive probe** (Server → Client):
```json
{
  "id": "<probe-uuid>",
  "memberId": "<your-member-id>"
}
```

**Required response** (Client → Server):
```json
{
  "id": "<new-uuid>",
  "sourceEventId": "<probe-uuid>",
  "success": true
}
```

You may also send **client-initiated keep-alive** messages to confirm your own
liveness.

> ⚠️ **Changed in cyoda-go v0.8.3: the server does not reply to these.** An
> inbound member keep-alive is liveness-only — it refreshes your member's
> last-seen timestamp and produces no response event. Each side pings on its
> own ticker.
>
> Previously the server echoed a keep-alive back for every one it received.
> Against a client that likewise echoed what it received, that formed a
> zero-delay feedback loop which pinned both processes at ~100% CPU
> indefinitely, with nothing above `Debug` in the logs to show for it. **Do not
> write a handler that echoes an inbound keep-alive**, and if yours currently
> waits for an ack after sending one, remove that wait — it will never arrive.

Anything you send counts as activity: a keep-alive, a processor response, a
criteria response, or an `EventAckResponse` all refresh liveness. The server
closes the stream if it sees nothing from you within
`CYODA_KEEPALIVE_TIMEOUT` seconds (default `30`), and sends its own probes
every `CYODA_KEEPALIVE_INTERVAL` seconds (default `10`).

**Timing parameters** (server-side defaults):
| Parameter | Default | Description |
|---|---|---|
| Keep-alive probe interval | 1,000 ms | How often the server probes |
| Max idle interval | 3,000 ms | How long before a member is marked as not alive |
| Keep-alive check timeout | 1,000 ms | How long the server waits for a probe response |

A member is marked not alive when a probe times out (keep-alive check timeout, default 1,000 ms) **and** the max idle interval (default 3,000 ms) has been exceeded since the last successful probe response. Both conditions must hold — a single slow probe within the idle window does not mark the member dead.

**If your member is marked as not alive, the platform will not route requests to it.** The member remains registered but idle. Responding to a subsequent keep-alive probe restores the alive status.

> ⚠️ **Critical**: Failing to respond to keep-alive probes will cause your member to be marked as dead. Ensure your keep-alive response handler is fast and non-blocking.

---

# 6. Handling Processor Requests

When an entity reaches a workflow transition with an externalized processor configured to match your member's tags, the platform sends an `EntityProcessorCalculationRequest`.

## 6.1 Request Schema

```json
{
  "id": "<event-uuid>",
  "requestId": "<correlation-id>",
  "entityId": "<entity-uuid>",
  "processorId": "<processor-uuid>",
  "processorName": "<configured-processor-name>",
  "transactionId": "<transaction-uuid>",
  "workflow": {
    "id": "<workflow-uuid>",
    "name": "<workflow-name>"
  },
  "transition": {
    "id": "<transition-uuid>",
    "name": "<transition-name>",
    "stateFrom": "<source-state>",
    "stateTo": "<target-state>"
  },
  "parameters": { /* arbitrary JSON configured on the processor */ },
  "payload": {
    "type": "TREE",
    "data": { /* entity data as JSON — present only if attachEntity=true */ },
    "meta": { /* entity metadata */ }
  }
}
```

**Key fields**:
- `requestId` — You **must** echo this back in the response for correlation.
- `entityId` — The entity being processed. Echo this back.
- `processorName` — Use this to dispatch to different business logic handlers.
- `parameters` — Arbitrary JSON configured on the processor in the workflow definition (the `context` field). Use for passing configuration to your handler.
- `payload.data` — The entity data. Only present when `attachEntity` is `true` in the workflow configuration.

> 💡 **Auth context**: The CloudEvent envelope for this request also carries auth context extension attributes (`authtype`, `authid`, `authclaims`) identifying the principal whose action triggered the workflow. See [Section 9](#9-auth-context-on-incoming-requests) for details on how to extract them.

## 6.2 Response Schema

```json
{
  "id": "<new-uuid>",
  "requestId": "<echo-request-id>",
  "entityId": "<echo-entity-id>",
  "success": true,
  "payload": {
    "type": "TREE",
    "data": { /* modified entity data to write back */ }
  }
}
```

**Rules**:
1. **`requestId`** must exactly match the value from the request.
2. **`entityId`** must exactly match the value from the request.
3. If you set `success: true`, the platform applies your `payload.data` to the entity.
4. If you set `success: false`, the platform treats this as a processing failure. Include an `error` object.
5. The `payload` field is optional. If omitted (or `payload.data` is null), no data modification occurs.

## 6.3 Error Response

```json
{
  "id": "<new-uuid>",
  "requestId": "<echo-request-id>",
  "entityId": "<echo-entity-id>",
  "success": false,
  "error": {
    "code": "BUSINESS_ERROR",
    "message": "Detailed error description",
    "retryable": true
  }
}
```

The `error.retryable` flag tells the platform whether it should retry the request on a different member (if a retry policy is configured). Set to `true` for transient failures and `false` for permanent failures.

### 6.3.1 Infrastructure failures the platform raises

Separately from errors *you* return, the platform raises its own codes when a
callout cannot be delivered at all. As of cyoda-go v0.8.3 these surface
uniformly as a **retryable `503`** across all three callout kinds — processor,
criteria, and function:

| Code | Meaning |
|---|---|
| `NO_COMPUTE_MEMBER_FOR_TAG` | No connected member carries the required `calculationNodesTags`. |
| `COMPUTE_MEMBER_DISCONNECTED` | The selected member dropped mid-dispatch. |
| `DISPATCH_TIMEOUT` | No response within the configured response timeout. |
| `DISPATCH_FORWARD_FAILED` | Cross-node forwarding to the member's owner failed. |

Previously some of these — a missing compute member most visibly — fell through
to a misleading `400 WORKFLOW_FAILED`, which looks like a caller mistake rather
than a deployment problem. If you have error handling that treats
`WORKFLOW_FAILED` as non-retryable, re-check it: these now arrive as `503` and
are worth retrying.

---

# 7. Handling Criteria Requests

When a workflow transition has an externalized criterion configured as a `function`, the platform sends an `EntityCriteriaCalculationRequest`.

## 7.1 Request Schema

```json
{
  "id": "<event-uuid>",
  "requestId": "<correlation-id>",
  "entityId": "<entity-uuid>",
  "criteriaId": "<criteria-uuid>",
  "criteriaName": "<configured-function-name>",
  "target": "TRANSITION",
  "transactionId": "<transaction-uuid>",
  "workflow": {
    "id": "<workflow-uuid>",
    "name": "<workflow-name>"
  },
  "transition": {
    "id": "<transition-uuid>",
    "name": "<transition-name>",
    "stateFrom": "<source-state>",
    "stateTo": "<target-state>"
  },
  "processor": {
    "id": "<processor-uuid>",
    "name": "<processor-name>"
  },
  "parameters": { /* arbitrary JSON */ },
  "payload": {
    "type": "TREE",
    "data": { /* entity data */ }
  }
}
```

**The `target` field** indicates what the criterion is attached to:
| Target | Meaning | Available Context |
|---|---|---|
| `WORKFLOW` | Workflow-level criterion (selects which workflow applies) | `workflow` |
| `TRANSITION` | Transition-level criterion (should this transition fire?) | `workflow`, `transition` |
| `PROCESSOR` | Processor-level criterion (should this processor run?) | `workflow`, `transition`, `processor` |
| `NA` | Reserved for future use | — |

> 💡 **Auth context**: Like processor requests, criteria requests also carry auth context extension attributes on the CloudEvent envelope. See [Section 9](#9-auth-context-on-incoming-requests).

## 7.2 Response Schema

```json
{
  "id": "<new-uuid>",
  "requestId": "<echo-request-id>",
  "entityId": "<echo-entity-id>",
  "success": true,
  "matches": true,
  "reason": "Entity meets all validation criteria"
}
```

**Key fields**:
- `requestId` — Must exactly match the request.
- `entityId` — Must exactly match the request.
- `matches` — The boolean result: `true` means the criterion is satisfied (transition fires / processor runs), `false` means it is not.
- `reason` — Optional explanation for a `false` result. **Live end-to-end as of cyoda-go v0.8.3** — see below.

If `success: false`, the platform treats it as a criteria evaluation failure (the criterion evaluates to `false` by default).

### 7.2.1 Explaining a `false` result

`reason` was previously declared on the wire but discarded, so a criteria node
could block a transition without being able to say why. It now reaches the
caller and the audit trail, which makes it worth populating on every `false`.

Where it surfaces depends on how the criterion was reached:

- **A manual, explicitly-requested transition** rejected by its criterion
  appends the reason to the `400 WORKFLOW_FAILED` detail:
  `transition "<name>" criterion not matched: <reason>`. This is the
  guaranteed, backend-independent surface.
- **Automated cascade and workflow-selection paths** additionally record it
  durably on the state-machine audit trail —
  `TRANSITION_NOT_MATCH_CRITERION` carries
  `{workflowName, transition, criterion, reason}` in its `data`, and
  `WORKFLOW_SKIP` carries `{workflowName, reason}`.

Reasons are capped at **2 KiB**. An omitted reason defaults to
`"criterion did not match"`, so a blocked transition is never unexplained —
but the default tells nobody anything. Write the specific cause:
`"order total 4200 exceeds the 1000 auto-approval limit"` beats
`"validation failed"`.

---

# 8. Handling Function Requests

A **Function** callout is the third request shape your compute node may
receive, alongside Processor and Criteria. The three differ in what they are
allowed to do:

| Callout | Returns | Mutates the entity? |
|---|---|---|
| Processor | an updated entity payload | Yes |
| Criteria | a boolean `matches` | No |
| **Function** | a **declared typed value** | No |

A Function computes and returns a value without side effects. The response
carries a `resultKind` discriminator naming the shape of `result`, so the
caller can validate what it receives.

## 8.1 Request Schema

The request is an `EntityFunctionCalculationRequest`, structurally the same as
a processor request — `requestId`, `entityId`, the optional entity `payload`
(present when `attachEntity` is `true`), and `parameters` carrying the
configured `context` string.

## 8.2 Response Schema

```json
{
  "id": "<new-uuid>",
  "requestId": "<echo-request-id>",
  "entityId": "<echo-entity-id>",
  "success": true,
  "resultKind": "Schedule",
  "result": { "fireAfterMs": 3600000, "expireAfterMs": 600000 }
}
```

- `resultKind` — names the shape of `result`. **`"Schedule"` is currently the
  only defined kind.**
- `result` — the typed value itself.
- `success: false`, or an `error`, fails the dispatch exactly as a processor or
  criteria failure does.

## 8.3 The `Schedule` result kind

`Schedule` drives a
[scheduled transition's](/build/workflows-and-processors/#scheduled-transitions)
`schedule.function`, computing when a transition should fire for one specific
entity:

- **Fire time** (required) — exactly one of `fireAt` (absolute epoch-ms) or
  `fireAfterMs` (relative to arm time).
- **Expiry** (optional) — at most one of `expireAt` or `expireAfterMs`, the
  latter relative to the *resolved fire time* rather than to arm time.

> ⚠️ **This callout runs inside the caller's write transaction.** It is
> invoked synchronously while the entity write that arms the timer is still
> open, and it is re-invoked on *every* re-arm — not once per entity. A slow
> handler slows every write to that entity; a failing or unreachable handler
> **fails the write** with a retryable `503`. Keep it fast, side-effect free,
> and dependent only on data you already have.
>
> Returning a malformed `result`, or one that does not match the declared
> `resultKind`, fails the write with `500 SCHEDULE_FUNCTION_INVALID_RESULT`.

---

# 9. Auth Context on Incoming Requests

The platform attaches [CloudEvents Auth Context extension](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/authcontext.md) attributes to every `EntityProcessorCalculationRequest` and `EntityCriteriaCalculationRequest`. These attributes identify the authenticated principal whose action triggered the workflow execution (e.g., the user who created or updated the entity).

## 9.1 Extension Attributes

The auth context is carried as CloudEvent extension attributes in the Protobuf `attributes` map — **not** inside the JSON `text_data` payload.

| Attribute | Type | Required | Description |
|---|---|---|---|
| `authtype` | String | YES | Principal kind. Exactly one of: `user`, `service`, `system` |
| `authid` | String | NO | Unique identifier of the principal (UUID). Absent for `system`. |
| `authclaims` | String | NO | JSON string containing claims about the principal (e.g., `legalEntityId`, `roles`). Does not contain credentials. |

## 9.2 Auth Type Values

| `authtype` Value | Meaning |
|---|---|
| `user` | A regular authenticated user (JWT-based login) |
| `service` | A machine-to-machine (M2M) technical account |
| `system` | An internal platform trigger with no user context |

The value is driven by the principal's **explicit kind**, recorded when the
principal is established. It is no longer inferred from the presence of a
`ROLE_M2M` role, a guess that was wrong in both directions.

The attribute is always present and always faithful. If a principal's kind is
unset or unrecognized, the platform **fails the callout dispatch** rather than
emitting a normalized placeholder — a bogus `authtype` never reaches your
compute node.

> ⚠️ **Breaking change in cyoda-go v0.8.3.** `service_account` is retired in
> favour of `service`, and the `unauthenticated` and `unknown` values are gone
> — they were never emitted in practice. A compute node that switches on the
> old strings must be updated, and any `default`/`else` branch that previously
> caught `unauthenticated` should be re-examined: an unroutable principal now
> fails the dispatch instead of arriving as a fallback value.

### Attribution vs. execution

`authtype` and `authid` describe the principal the action is **attributed** to,
which is not necessarily the identity it **executes** with. When a user's
action sets off a follow-on — a cascade write from a processor, or a scheduled
transition firing later — the platform executes it with system or service
authority, borrowing no user permissions, while still attributing it to the
principal that caused it. Treat the auth context as provenance for audit and
business logic, not as proof of the executing identity's privileges.

## 9.3 Extracting Auth Context (Java/Kotlin)

The attributes are available in the Protobuf CloudEvent's `attributes` map. The keys are the attribute names listed above (no prefix):

```java
// From the gRPC StreamObserver<CloudEvent>.onNext(value):
String authType = value.getAttributesMap().get("authtype").getCeString();
String authId = value.getAttributesMap().containsKey("authid")
    ? value.getAttributesMap().get("authid").getCeString()
    : null;
String authClaimsJson = value.getAttributesMap().containsKey("authclaims")
    ? value.getAttributesMap().get("authclaims").getCeString()
    : null;

// Parse claims if present
if (authClaimsJson != null) {
    Map<String, Object> claims = objectMapper.readValue(authClaimsJson, Map.class);
    String legalEntityId = (String) claims.get("legalEntityId");
    List<String> roles = (List<String>) claims.get("roles");  // may be null for plain IUser
}
```

The exact accessor depends on your gRPC tooling — in Go, use the generated message's `GetAttributes()` method; in Python, dict-like indexing on `.attributes`. See your language's generated proto bindings.

**Go clients** can skip the manual extraction: cyoda-go v0.8.3 ships an
`api/grpc/authctx` helper exposing `Type`, `ID` and `Roles` readers plus
`Require(ce, role)`. `Require` is a **fail-closed** role gate — it returns
`false` for a nil event, for absent or empty claims, and for
`authtype == system`. Prefer it over hand-rolled claim parsing, which tends to
fail *open* on exactly those cases.

## 9.4 Example Claims JSON

```json
{
  "legalEntityId": "acme-corp",
  "roles": ["USER", "SUPER_USER"]
}
```

For `service` (M2M) principals:
```json
{
  "legalEntityId": "acme-corp",
  "roles": ["M2M"]
}
```

## 9.5 Use Cases

- **Audit logging**: Record which user triggered the processing for compliance.
- **Authorization decisions**: Apply different business logic based on the caller's roles or legal entity.
- **Multi-tenant isolation**: Verify the triggering principal belongs to the expected tenant.
- **Debugging**: Trace processing failures back to the originating user action.

> ⚠️ **Note**: The `authclaims` field never contains credentials (passwords, tokens, secrets). It contains only identity and authorization metadata.

---

# 10. Workflow Configuration

Your calculation member does not exist in isolation — it is invoked by workflow configurations on the platform side. This section describes how workflows reference externalized processors and criteria, so you understand the relationship between your member's tags/handlers and the platform configuration.

## 10.1 Externalized Processor in Workflow JSON

```json
{
  "workflows": [{
    "version": "1",
    "name": "my-workflow",
    "initialState": "start",
    "states": {
      "start": {
        "transitions": [{
          "name": "process-data",
          "next": "processed",
          "manual": false,
          "processors": [{
            "name": "my-processor-function",
            "executionMode": "SYNC",
            "config": {
              "attachEntity": true,
              "calculationNodesTags": "my-processor-tag",
              "responseTimeoutMs": 60000,
              "retryPolicy": "FIXED",
              "context": "{\"key\": \"value\"}"
            }
          }]
        }]
      },
      "processed": {}
    }
  }]
}
```

## 10.2 Processor Configuration Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | — | **Required.** The processor name. Sent as `processorName` in the request. |
| `executionMode` | string | — | **Required.** One of `SYNC`, `ASYNC_SAME_TX`, `ASYNC_NEW_TX`, `COMMIT_BEFORE_DISPATCH`. |
| `config.attachEntity` | boolean | `true` | Whether to send entity data in the request payload. **Changed in v0.8.3:** a processor that omits this field is now imported with `attachEntity: true`. Set it to `false` explicitly to opt out. |
| `config.calculationNodesTags` | string | `""` | Comma/semicolon-separated tags. Only members whose tags are a superset are eligible. |
| `config.responseTimeoutMs` | long | `60000` | How long the platform waits for your response before timing out. |
| `config.retryPolicy` | string | `FIXED` | `NONE` — no retry. `FIXED` — retry with fixed delay (default: 3 retries, 500ms delay). |
| `config.context` | string | `null` | Arbitrary string passed as `parameters` in the request. Use for handler-specific configuration. |
| `config.asyncResult` | boolean | `false` | Enable async response processing (advanced). |
| `config.crossoverToAsyncMs` | long | `5000` | Time before switching from sync to async response handling (advanced). |
| `startNewTxOnDispatch` | boolean | `false` | Whether a fresh transaction is started when this processor is dispatched. Valid only when `executionMode` is `COMMIT_BEFORE_DISPATCH`; the validator rejects `true` for any other mode. With `COMMIT_BEFORE_DISPATCH` and `startNewTxOnDispatch=false` (the default), callbacks run standalone instead of joining the originating transaction (see §10.3.1). |

## 10.3 Execution Modes

| Mode | Behavior |
|---|---|
| `SYNC` | The workflow engine waits for your response within the same transaction. The transition completes only after your response is applied. |
| `ASYNC_SAME_TX` | The engine sends the request and can process other work. Your response is applied within the same entity transaction. |
| `ASYNC_NEW_TX` | Like `ASYNC_SAME_TX`, but your response is applied in a new transaction. Useful for long-running computations. |
| `COMMIT_BEFORE_DISPATCH` | Commits the originating transaction before dispatching the request, releasing the storage connection for the duration of the external compute; the processor runs outside any transaction unless `startNewTxOnDispatch=true` opens one for it (see §10.3.1). On return, the result is reapplied via CompareAndSave in a new transaction. Relieves connection-pool pressure for slow processors; supersedes `ASYNC_NEW_TX` as the recommended mode for slow external work. |

> For most use cases, **`SYNC`** is the simplest and recommended starting point.

### 10.3.1 Transaction-joined callbacks

Processor and criteria-evaluation callbacks from a compute node **join the originating workflow transaction** `T` rather than running standalone. Before each dispatch the engine mints a signed HMAC transaction token and attaches it to the outbound CloudEvent as the `cyodatxtoken` extension attribute. Your compute node echoes it back on callbacks — as the `X-Tx-Token` HTTP header or the `tx-token` gRPC metadata — and the receiving node verifies the HMAC and routes the callback to the transaction owner (a local join when the owner is this node, or an HTTP reverse-proxy / gRPC forward otherwise).

The practical consequences:

- Callbacks see the cascade's **uncommitted** writes, and their acks stay provisional until `T` commits.
- `ASYNC_NEW_TX` callbacks join `T` via a savepoint, so a processor failure discards its own writes without aborting the whole cascade.
- If no token is present the callback falls back to standalone execution — the normal behaviour for `COMMIT_BEFORE_DISPATCH` with `startNewTxOnDispatch=false`.
- **As of v0.8.3 this covers the search RPCs too.** A callback presenting a valid `tx-token` on `EntitySearch` or `EntitySearchCollection` previously had it silently ignored — the interceptor was wired only for the write RPCs. A processor's writes therefore joined the originating transaction while its *searches* ran unjoined against last-committed state, returning stale results with no error to signal it. If you worked around this by re-reading entities after writing them, that workaround is no longer needed.

Three environment variables tune this (full list in the [configuration reference](/reference/configuration/#all-variables)):

- `CYODA_TX_TOKEN_TTL` — validity of the signed token (default `1m30s`).
- `CYODA_GRPC_NODE_ADDR` — this node's gRPC endpoint advertised to peers (`host:port`, no scheme), used for B→A forwarding.
- `CYODA_COMPUTE_HTTP_BASE` — base URL of the cyoda instance a compute node calls back into (compute-client side).

## 10.4 Externalized Criteria (Function) in Workflow JSON

```json
{
  "transitions": [{
    "name": "conditional-transition",
    "next": "target-state",
    "manual": false,
    "criterion": {
      "type": "function",
      "function": {
        "name": "my-criteria-function",
        "config": {
          "attachEntity": true,
          "calculationNodesTags": "my-processor-tag",
          "responseTimeoutMs": 5000,
          "retryPolicy": "NONE"
        }
      }
    }
  }]
}
```

Criteria functions use the same `config` fields as processors (except `asyncResult` and `crossoverToAsyncMs`, which are not applicable to criteria).

## 10.5 Retry Policies

| Policy | Behavior |
|---|---|
| `NONE` | No retry. If the member fails or times out, the processing fails. |
| `FIXED` | Retries up to N times (default: 3) with a fixed delay (default: 500ms) between retries. Each retry attempts a **different** member if available (the failed member is excluded from selection). |

---

# 11. BaseEvent Schema

All events on the stream extend the `BaseEvent` schema:

```json
{
  "id": "<string, required>",
  "success": true,
  "error": {
    "code": "<string, required if error>",
    "message": "<string, required if error>",
    "retryable": false
  },
  "warnings": ["<optional array of warning strings>"]
}
```

- `id` — Every event must have a unique ID (UUID recommended).
- `success` — Defaults to `true`. Set to `false` to indicate an error.
- `error` — Only relevant when `success` is `false`. The `code` and `message` fields are required within the error object.
- `warnings` — Optional array of warning strings.

---

# 12. Production Robustness

## 12.1 Reconnection Strategy

gRPC streams can be terminated by network issues, server restarts, or load balancer timeouts. Implement automatic reconnection:

1. **Detect disconnection** via `onError` or `onCompleted` on the response observer.
2. **Back off exponentially** — start at 1 second, cap at 60 seconds.
3. **Re-join after reconnect** — every new stream requires a fresh `CalculationMemberJoinEvent`.
4. **Refresh the JWT token** before reconnecting if it is near expiry.

```
┌─────────┐    onError/onCompleted    ┌──────────┐    delay    ┌──────────────┐    success    ┌──────┐
│ Connected│ ──────────────────────► │ Backoff  │ ────────► │ Reconnecting │ ────────────► │ Join │
└─────────┘                          └──────────┘           └──────────────┘              └──────┘
     ▲                                                            │ failure                   │
     │                                                            ▼                           │
     │                                                      ┌──────────┐                      │
     │                                                      │ Backoff  │ (increase delay)      │
     │                                                      └──────────┘                      │
     └────────────────────────────────────────────────────────────────────────────────────────┘
                                              Greet received
```

## 12.2 Thread Safety

The gRPC `StreamObserver` is **not thread-safe**. If your business logic runs on multiple threads, synchronize all calls to `observer.onNext()`:

```java
synchronized (requestObserver) {
    requestObserver.onNext(cloudEvent);
}
```

## 12.3 Response Timeouts

Your client must respond within the configured `responseTimeoutMs` (default: 60 seconds). If you exceed this:
- The platform considers the request failed.
- If retry policy is `FIXED`, the platform retries with a different member.
- Late responses are silently discarded.

Design your business logic to complete well within the timeout, accounting for network latency.

## 12.4 Idempotency

In edge cases (e.g., network partitions, retries), you may receive the same request more than once. Use the `requestId` as an idempotency key to avoid processing the same request twice.

## 12.5 Graceful Shutdown

When shutting down your client:

1. Stop accepting new requests (drain in-flight work).
2. Complete any pending responses and send them.
3. Close the gRPC stream via `requestObserver.onCompleted()`.
4. Shut down the `ManagedChannel` with a grace period:
   ```java
   channel.shutdown().awaitTermination(10, TimeUnit.SECONDS);
   ```

The platform will detect the stream closure and broadcast a member-offline event to the cluster. Pending requests that were in-flight will time out and may be retried on other members.

## 12.6 Multiple Members

You can run **multiple calculation member instances** (same or different processes) with the same tags for horizontal scaling and high availability. The platform selects one eligible member per request, preferring members connected to the local cluster node. Running at least two members ensures continued processing if one goes down.

## 12.7 Monitoring

Track these metrics in your client:
- **Request count** by type (processor vs. criteria) and result (success vs. failure)
- **Response latency** (time from receiving request to sending response)
- **Keep-alive response time**
- **Reconnection count and frequency**
- **Stream errors** (by gRPC status code)

---

# 13. Quick Reference — Message Flow

```
Client                                          Server
  │                                                │
  │──── startStreaming() ─────────────────────────►│   (open bidirectional stream)
  │                                                │
  │──── CalculationMemberJoinEvent ───────────────►│   (register with tags)
  │◄─── CalculationMemberGreetEvent ───────────────│   (server confirms, assigns memberId)
  │                                                │
  │◄─── CalculationMemberKeepAliveEvent ───────────│   (periodic heartbeat probe)
  │──── EventAckResponse ─────────────────────────►│   (ack the probe)
  │                                                │
  │◄─── EntityProcessorCalculationRequest ─────────│   (process this entity)
  │──── EntityProcessorCalculationResponse ───────►│   (here's the result)
  │                                                │
  │◄─── EntityCriteriaCalculationRequest ──────────│   (evaluate this criterion)
  │──── EntityCriteriaCalculationResponse ────────►│   (matches: true/false)
  │                                                │
  │──── CalculationMemberKeepAliveEvent ──────────►│   (client-initiated heartbeat)
  │◄─── EventAckResponse ─────────────────────────│   (server acks)
  │                                                │
```

---

# 14. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `UNAUTHENTICATED` on stream open | Missing/invalid/expired JWT token | Refresh JWT before connecting. Ensure `Authorization: Bearer <token>` header. |
| `NOT_FOUND` after JWT validation | User not found in Cyoda for the given JWT | Verify user enrollment and legal entity configuration. |
| Greet event has `success: false` | Subscription limit exceeded (max client nodes) | Check your subscription plan limits. |
| Member marked as not alive | Keep-alive responses too slow or missing | Ensure non-blocking, fast keep-alive handler. Check network latency. |
| Requests not arriving | Tags mismatch | Verify your member's tags are a superset of the workflow processor's `calculationNodesTags`. Tags are case-insensitive. |
| Requests not arriving | Member on wrong legal entity | Requests only route to members in the same legal entity as the entity owner. |
| Request timeout | Business logic too slow | Optimize processing time or increase `responseTimeoutMs` in workflow config. |
| Duplicate requests | Retry policy triggered | Implement idempotency using `requestId`. |
| Stream drops unexpectedly | Server restart, network issue, idle timeout | Implement reconnection with exponential backoff (Section 12.1). |
| `authtype` is `system` unexpectedly | Workflow triggered by an internal platform action (e.g., scheduled transition) or no user context was available | This is expected for system-initiated workflows. If you expect a user context, verify the originating API call is authenticated. |
| `authclaims` is missing | The triggering principal is a plain `IUser` without extended claims, or the auth type is `system` | Only `user` and `service` auth types include claims. Check `authtype` before parsing claims. |
| `authtype` is `service`, not `service_account` | cyoda-go v0.8.3 retired `service_account` | Update the switch in your handler. See [Section 9.2](#92-auth-type-values). |
| Callout never arrives; dispatch fails | The originating principal's kind is unset or unrecognized | Dispatch fails closed rather than sending a bogus `authtype`. Check the principal's kind on the platform side. |

