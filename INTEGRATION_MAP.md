# Claw-Infra Integration Map

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Dashboard │ │ Agents  │ │ Projects │ │  Costs  │ │  Chat   │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │            │            │            │            │              │
│       └────────────┴────────────┴────────────┴────────────┘              │
│                                   │                                      │
│                    ┌──────────────┴──────────────┐                      │
│                    │    useWebSocket Hook        │                      │
│                    │  ┌─────────────────────────┐│                      │
│                    │  │ - Connection management  ││                      │
│                    │  │ - Auto-reconnect         ││                      │
│                    │  │ - Channel subscriptions   ││                      │
│                    │  └─────────────────────────┘│                      │
│                    └──────────────┬──────────────┘                      │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │         REST API              │
                    │  /api/agents/* /api/projects/*│
                    │  /api/costs/* /api/logs/*    │
                    └───────────────┬───────────────┘
                                    │
┌───────────────────────────────────┼─────────────────────────────────────┐
│                          Backend (NestJS)                                │
│                                  │                                       │
│   ┌──────────────────────────────┴──────────────────────────────┐      │
│   │                      App Gateway (WS)                         │      │
│   │  Channels: global:status, resources:live, run:*, logs:*      │      │
│   │                     project:*                                   │      │
│   └──────────────────────────────┬──────────────────────────────┘      │
│                                  │                                       │
│   ┌──────────────────────────────┴──────────────────────────────┐      │
│   │                Chat Gateway (WS /chat)                        │      │
│   │  Events: send_message, typing:start/stop, presence:*        │      │
│   │  session:recover, connection:status                          │      │
│   └──────────────────────────────┬──────────────────────────────┘      │
│                                  │                                       │
│           ┌──────────────────────┼──────────────────────┐               │
│           │                      │                      │               │
│   ┌───────┴───────┐ ┌────────────┴──────────┐ ┌────────┴────────┐       │
│   │  PubSubService│ │   Feature Modules     │ │ Auth Guards    │        │
│   │   (Redis)     │ │                       │ │                │        │
│   └───────┬───────┘ │  - AgentsModule       │ │ - JwtAuthGuard │        │
│           │         │  - ProjectsModule     │ │ - ApiKeyGuard  │        │
│           │         │  - CostsModule         │ │ - ProjectGuard │        │
│           │         │  - LogsModule          │ └────────────────┘       │
│           │         │  - MetricsModule       │                          │
│           │         │  - ChatModule          │                          │
│           │         │  - CodeModule          │                          │
│           │         │  - AlertsModule        │                          │
│           │         └────────────────────────┘                          │
│           │                                                              │
│   ┌───────┴───────┐ ┌─────────────────────────────────────────────┐      │
│   │    Redis      │ │              TypeORM / PostgreSQL           │      │
│   │  - Pub/Sub    │ │  Tables: agent_runs, agent_steps,           │      │
│   │  - Caching    │ │           cost_records, resource_snapshots,  │      │
│   │               │ │           agent_logs, projects, cards,      │      │
│   │               │ │           users, api_keys, chat_sessions     │      │
│   └───────────────┘ └─────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │      Ingest API (/api/ingest)  │
                    │   - Agent API Key Auth         │
                    │   - Rate limited (30/min)      │
                    └───────────────┬───────────────┘
                                    │
┌───────────────────────────────────┼─────────────────────────────────────┐
│                          Agent (ZeroClawSidecar)                        │
│                          ┌──────────┴──────────┐                       │
│                          │    ingest-client.ts  │                       │
│                          │  - createRun()      │                       │
│                          │  - startRun()        │                       │
│                          │  - completeRun()     │                       │
│                          │  - createStep()      │                       │
│                          │  - completeStep()    │                       │
│                          │  - recordCost()      │                       │
│                          │  - sendLog()         │                       │
│                          │  - sendMetrics()     │                       │
│                          └──────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## WebSocket Events

### AppGateway (namespace: `/`)

| Event | Direction | Channel/Room | Purpose |
|-------|-----------|--------------|---------|
| `subscribe` | Client→Server | `{channel}` | Subscribe to a channel |
| `unsubscribe` | Client→Server | `{channel}` | Unsubscribe from channel |
| `global:status` | Server→Client | room: `global:status` | Run status updates (created, started, completed, cancelled) |
| `resources:live` | Server→Client | room: `resources:live` | Live resource metrics (CPU, memory) |
| `run:{id}` | Server→Client | room: `run:{id}` | Run-specific updates (step created/updated) |
| `logs:{id}` | Server→Client | room: `logs:{id}` | Log stream for specific run |
| `project:{id}` | Server→Client | room: `project:{id}` | Project-specific updates |
| `error` | Server→Client | - | Authentication/connection error |

**Channel Validation:**
- `global:status` - Static channel
- `resources:live` - Static channel
- `run:{uuid}` - Dynamic, validates UUID format
- `logs:{uuid}` - Dynamic, validates UUID format
- `project:{uuid}` - Dynamic, validates UUID format

### ChatWebSocketGateway (namespace: `/chat`)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `connection:established` | Server→Client | Confirms connection with session info |
| `connection:status` | Client↔Server | Get current connection status |
| `message_history` | Server→Client | Sends last 50 messages on connect |
| `send_message` | Client→Server | Send chat message or command |
| `message_response` | Server→Client | Response to message/command |
| `chat_event` | Server→Client | Broadcast message to user's clients |
| `typing:start` | Client→Server | Start typing indicator |
| `typing:stop` | Client→Server | Stop typing indicator |
| `typing_status` | Server→Client | Typing status broadcast |
| `presence:update` | Server→Client | User presence updates |
| `presence:get` | Client→Server | Get presence for users |
| `session:recover` | Client→Server | Recover missed messages |
| `session:recovered` | Server→Client | Session recovery confirmation |
| `set_active_project` | Client→Server | Set active project context |
| `update_preferences` | Client→Server | Update session preferences |
| `get_session_status` | Client→Server | Get session statistics |
| `ping` | Client→Server | Heartbeat |
| `error` | Server→Client | Error notification |

---

## REST API Endpoints

### /api/auth
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/login` | None | Login user |
| POST | `/register` | None | Register user (if enabled) |
| GET | `/api-keys` | JWT | List user's API keys |
| POST | `/api-keys` | JWT | Create new API key |
| DELETE | `/api-keys/:id` | JWT | Revoke API key |

### /api/ingest (Agent API Key Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/runs` | Create new agent run |
| POST | `/runs/:id/start` | Mark run as started |
| PATCH | `/runs/:id/status` | Update run status |
| POST | `/runs/:runId/steps` | Create a step |
| PATCH | `/steps/:id/status` | Update step status |
| POST | `/costs` | Record cost event |
| POST | `/logs` | Send log entry |
| POST | `/logs/batch` | Send batch logs |
| POST | `/metrics` | Report resource metrics |

### /api/agents (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/stats` | Dashboard statistics |
| GET | `/timeline` | Run timeline data |
| GET | `/active` | Active runs |
| GET | `/` | List runs with filters |
| GET | `/cards/search` | Search linkable cards |
| GET | `/:id` | Get run by ID |
| GET | `/:id/steps` | Get run steps |
| POST | `/:id/start` | Start a run |
| PATCH | `/:id/link-card` | Link run to card |
| DELETE | `/:id/cancel` | Cancel run |
| GET | `/projects/:projectId/runs` | Get runs by project |
| GET | `/cards/:cardId/runs` | Get runs by card |

### /api/costs (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/summary` | Cost summary |
| GET | `/by-model` | Costs by model |
| GET | `/by-agent` | Costs by agent |
| GET | `/trend` | Daily cost trend |
| GET | `/top-runs` | Top expensive runs |
| GET | `/budgets` | List budgets |
| GET | `/budgets/status` | Budget status |
| POST | `/budgets` | Create/update budget |
| GET | `/projected` | Projected spend |

### /api/metrics (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/latest` | Latest resource snapshot |
| GET | `/history` | Metrics history |
| GET | `/by-agent` | Metrics by agent |
| GET | `/runs/:runId` | Run-specific metrics |

### /api/logs (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/runs/:runId` | Get logs for run |
| GET | `/errors` | Recent error logs |

### /api/projects (JWT Auth + Project Guards)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | List projects |
| POST | `/` | Create project |
| GET | `/:id` | Get project |
| PUT | `/:id` | Update project |
| DELETE | `/:id` | Delete project |
| PUT | `/:id/archive` | Archive project |
| GET | `/:id/kanban` | Get default board |
| POST | `/:id/kanban/columns` | Create column |
| GET | `/:id/cards` | List cards |
| POST | `/:id/cards` | Create card |
| ... | ... | (Full CRUD for columns, cards, comments) |

### /api/chat (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/sessions` | List chat sessions |
| GET | `/sessions/:id` | Get session |
| DELETE | `/sessions/:id` | Delete session |

### /api/code (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/overview` | Code overview stats |
| GET | `/trends` | Code trends |
| GET | `/prs` | Pull requests |
| GET | `/quality` | Code quality metrics |
| POST | `/sync/backfill` | Trigger backfill |

### /api/github (JWT Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/status` | GitHub App status |
| GET | `/installations` | List installations |
| GET | `/repos` | List accessible repos |
| POST | `/repos/grant` | Grant repo access |
| DELETE | `/repos/grant/:id` | Revoke grant |

---

## Data Flow: Agent Run Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENT RUN LIFECYCLE                         │
└─────────────────────────────────────────────────────────────────┘

1. RUN CREATION
   Agent → POST /api/ingest/runs
   ┌─────────────────────────────────────────────────┐
   │ {agentName, trigger, configSnapshot, metadata} │
   └───────────────────────┬─────────────────────────┘
                           │
   Backend creates AgentRun(status=QUEUED)
                           │
   PubSub.publish('run:{id}', {type: 'run.created'})
   PubSub.publish('global:status', {...})
                           │
   WebSocket → Clients subscribed to global:status

2. RUN START
   Agent → POST /api/ingest/runs/:id/start
   Backend updates: status=RUNNING, startedAt=now
   PubSub.publish('run:{id}', {type: 'run.started'})

3. STEP CREATION
   Agent → POST /api/ingest/runs/:runId/steps
   Backend creates AgentStep(status=PENDING)
   PubSub.publish('run:{id}', {type: 'step.created', step})

4. STEP COMPLETION
   Agent → PATCH /api/ingest/steps/:id/status
   Backend updates: status=COMPLETED/FAILED, durationMs, tokens, cost
   PubSub.publish('run:{id}', {type: 'step.updated', step})

5. COST RECORDING
   Agent → POST /api/ingest/costs
   Backend creates CostRecord
   (No WebSocket broadcast - cost data queried on demand)

6. LOG STREAMING
   Agent → POST /api/ingest/logs (or /logs/batch)
   Backend creates AgentLog
   PubSub.publish('logs:{runId}', {level, message, metadata})

7. RESOURCE METRICS
   Agent → POST /api/ingest/metrics
   Backend creates ResourceSnapshot
   PubSub.publish('resources:live', {...})

8. RUN COMPLETION
   Agent → PATCH /api/ingest/runs/:id/status
   {status: 'completed'|'failed', durationMs, totalTokens, totalCost}
   Backend updates: status, completedAt, totals
   PubSub.publish('run:{id}', {type: 'run.updated'})
   PubSub.publish('global:status', {...})
```

---

## Frontend Hook Architecture

### Current State

```
useWebSocket.ts
├── Global socket instance (singleton pattern)
├── Connection status tracking
├── Auto-reconnect with exponential backoff
├── Channel subscribe/unsubscribe
└── Event listener registration

useGlobalStatus.ts
├── Uses useWebSocket
├── Subscribes to: global:status, resources:live
└── Returns: recentUpdates[], liveResources, wsStatus

use-chat-socket.ts
├── Separate socket connection to /chat namespace
├── Chat-specific event handling
└── Session recovery

useAgentStream.ts
├── Run-specific subscriptions
└── Real-time run updates
```

### Missing/Needed

1. **useRunChannel** - Dedicated hook for individual run subscriptions
2. **useLogStream** - Real-time log streaming hook
3. **useProjectChannel** - Project-level real-time updates
4. **useResourceMetrics** - Live resource gauges
5. **Connection status indicator** - Visual feedback for WS state

---

## Integration Gaps

### 1. WebSocket Unification
- **Issue**: Two separate gateways (AppGateway + ChatWebSocketGateway)
- **Impact**: Different auth flows, different connection management
- **Solution**: Unified socket with namespace routing

### 2. Agent Error Recovery
- **Issue**: No retry logic in ingest-client.ts
- **Impact**: Lost dataon network failures
- **Solution**: Add exponential backoff + local buffering

### 3. Idempotency
- **Issue**: No idempotency keys for run creation
- **Impact**: Duplicate runs on retry
- **Solution**: Add idempotency.service.ts usage

### 4. Frontend State Sync
- **Issue**: No optimistic updates for projects/cards
- **Impact**: UI lags behind server state
- **Solution**: Implement optimistic updates with rollback

### 5. Log Streaming UX
- **Issue**: Logs fetched via REST, not streamed
- **Impact**: No real-time log visibility
- **Solution**: Subscribe to logs:{runId} channel

---

## Module Dependencies

```
AppModule
├── AuthModule ──────────────────► JwtStrategy, ApiKeyGuard
├── AgentsModule ───────────────► AgentsService, AppGateway
├── CostsModule ────────────────► CostsService
├── LogsModule ─────────────────► LogsService
├── MetricsModule ──────────────► MetricsService
├── WsModule ───────────────────► PubSubService (Redis)
├── AlertsModule ───────────────► TelegramService
├── CodeModule ─────────────────► GitHubAppService
├── ProjectsModule ─────────────► ProjectsService, KanbanService, CardsService
├── ChatModule ─────────────────► ChatWebSocketGateway, ChatSessionService
└── MaintenanceModule ──────────► Scheduled tasks

Key Cross-Module Dependencies:
- AgentsService → AppGateway (broadcasting)
- ChatWebSocketGateway → PubSubService (global status)
- ProjectsService → AgentsService (linked cards)
```

---

## Security Layers

1. **IP Allowlist** - `IpAllowlistGuard` checks allowed IPs in production
2. **JWT Auth** - Standard user authentication for dashboard
3. **API Key Auth** - Agent authentication for ingest API
4. **Project Guards** - Role-based access control for projects
5. **Rate Limiting** - ThrottlerModule with separate limits per endpoint type
6. **CORS** - Configured origin checking with localhost support in dev
7. **Helmet** - Security headers including CSP in production

---

## Recommended Integration Priority

1. **Phase 2**: Backend hardening (idempotency, retry logic, health checks)
2. **Phase 3**: WebSocket unification (single hook system, connection status)
3. **Phase 4**: Agent pipeline completion (error recovery, buffering)
4. **Phase 5**: Real-time dashboard (log streaming, resource gauges)
5. **Phase 6**: Testing & documentation