Project Description
Metero — Trust-Minimized Micropayments for MCP / Agentic Services One-liner

Pay AI/agent services directly from your wallet with cryptographic IOUs. No middleman required. Stake once, sign EIP-712 “debits” per call, and providers claim on-chain from escrow—batchable, replay-safe, and gas-efficient.

What it does

Lets users stake USDC and call any registered MCP/agent service.

Each call is authorized by a user-signed EIP-712 IOU (with nonce/epoch/deadline).

Providers receive micropayments from user escrow via a Settlement contract (anyone can relay).

Optional cumulative IOUs (“running tab”): user signs totals; Settlement pays only the delta.

Works peer-to-peer: users connect to providers directly via WebSocket (or through our relayer).

Supports hosted AI agents (text-in/text-out) powered by Gemini as a built-in demo provider.

Why it’s different

Middleman-optional: cryptographic payments + endpoint discovery on-chain; clients can talk straight to providers.

Standardizable: an EAS (Ethereum Agentic Servers) registry behaves like ENS for agents—canonical endpoints + pricing + network pointers.

Provider-friendly: batch settlement, per-delta limits, event-driven unstake alerts; easy webhooks/WS adapters.

User-safe: stake caps, allow-listed tokens, per-call limits, short deadlines, nonces/epochs, and an unstake window.

How it works (flow)

Discover: Client reads EAS to get Settlement/Escrow/USDC addresses, provider WebSocket URL, and service metadata (unit + price).

Quote & Sign: Client computes price, builds a Debit (payer, provider, serviceId, amount, token, nonce, epoch, deadline) and signs EIP-712.

Call:

Direct mode: Client sends {request, debit, signature} over WebSocket to the provider.

Relayer mode: Same payload via our Express API (stores IOUs for the provider).

Verify (provider/relayer): checks signature, nonce, epoch, deadline, amount==quoted, budget/unstake.

Execute: Provider runs the service and returns the result; IOU is stored off-chain.

Claim: Provider (or anyone) calls settleBatch(debits, sigs) → Escrow pays provider in USDC.

Unstake: User requests unstake (7-day window); event notifies providers to claim outstanding IOUs.

Architecture

Smart contracts

Escrow: stake/unstake; guarded withdraw post-deadline.

Settlement: verifies EIP-712 debits, enforces nonce/epoch/deadline, token allow-list & per-call cap, pays providers; supports cumulative IOUs with paidUpTo.

EAS (Registry): provider endpoints, service metadata (unit, 6-dp price), allowDirect flag, and network pointers (escrow/settlement/usdc). Global service index for pagination.

SDK (TypeScript, ethers v6)

Client: new MCP({ signer, chain, registry }) → getService(serviceId) → request({ input }) (handles pricing, nonce/epoch lookup, EIP-712 signing, WS send with bigint-safe JSON).

Provider: new McpServer({ allowDirect, saveIOU }) → bindService(def) → start(port) (verifies debit on-chain, executes handler, stores IOUs).

Claiming: ProviderClaimer groups pending IOUs, sorts by nonce, enforces caps/unstake, submits settleBatch, marks settled.

Relayer/API (Express) (optional)

Provider onboarding, service registry mirror, /call/:serviceId, /providers/claim, Mongo-ready (MVP uses in-memory).

Security model

Authorization: EIP-712 typed data; ERC-1271 ready.

Anti-replay: per-(payer,provider) nonce, epoch bumps on pause/unstake; short deadlines.

Spending caps: per-call limit (delta) + stake budget.

Unstake protection: after unstakeAt, settlements revert; providers are notified via event.

Direct transport: HMAC for webhooks, WS JSON schema validation, rate limits, timeouts.

Bigint-safe wire: custom JSON (stringify/hydrate) for robust cross-lang clients.

What we built during the hackathon

Working contracts (Escrow, Settlement with cumulative IOUs, EAS registry with global indexing).

Hardhat tests & scripts: single & batch settlement, unstake window reverts, cumulative delta behavior.

Production-style SDK: client, provider WS server, claim utility, bigint-safe JSON.

Express backend (optional relayer): provider register, add service, call, claim.

Hosted Agent demo: create an agent webhook (Gemini), priced per 1K chars, billed with the same EIP-712 flow.

Demo scenario

User stakes 100 USDC.

Calls “web.fetch” service → signs debit → provider returns result.

Provider hits Claim → receives USDC from user’s escrow.

User requests unstake → providers are notified via event; further settlements after the deadline revert.

How it's Made
Stack at a glance

Solidity (0.8.24) — Escrow, Settlement (EIP-712 debit verifier), EAS registry.

Hardhat — local chain, scripts, tests; TypeChain + ethers v6 typings.

TypeScript SDK — client, provider WS server, and provider claimer.

Express (optional relayer) — REST for provider onboarding, call, claim.

WebSocket (ws) — direct client→provider transport.

Mongo-ready (MVP uses in-memory stores) — IOU persistence.

Gemini API — hosted text agent demo (text-in/text-out).

USDC (6dp) — pricing & settlement denomination.

Contracts (Trust-minimized core)

Escrow.sol

deposit/withdraw/requestUnstake/unstakeAt/paused(user); 7-day cooldown.

Guardrail for Settlement: post-deadline settlements revert.

Settlement.sol

Verifies EIP-712 Debit {payer, provider, serviceId, amount, token, nonce, epoch, deadline}.

Cumulative IOUs: stores paidUpTo[payer][provider][epoch]; pays only delta (amount − paidUpTo).

Anti-replay: nonce == nextNonce, epoch bumps invalidate old IOUs, short deadlines.

Policy: token allow-list, per-call cap (applies to delta), optional unstake window check.

settleBatch(debits[], sigs[]) — anyone can relay; funds go to debit.provider.

EAS.sol (Ethereum Agentic Servers)

Canonical pointers: settlement, escrow, usdc.

Provider endpoints: ws(s):// (and alt) + service catalog (unit/call|chars|pages, pricePerUnit6, schema URIs, allowDirect, active).

Global index: _allServiceIds, serviceIndex, totalServices(), serviceIdAt(), serviceIds(start,count).

Events for indexers; only provider can mutate its entries.

SDK (Developer experience)

Client

Discovers pointers & service meta (via EAS).

Quotes price (call/chars/pages), fetches nextNonce/epoch, builds cumulative amount, signs EIP-712 with ethers v6.

Sends {request, debit, signature} over WebSocket (or to relayer if useRelayer=true).

BigInt-safe JSON: custom stringifyWithBigInt() and on the server hydrateDebitInPlace() so we can pass 64-bit values over JSON deterministically.

Provider (McpServer)

Tiny WS server: verifies signature (EOA/ready for ERC-1271), nonce, epoch, deadline, amount == quoted, budget/unstake against chain.

Invokes the user-supplied handler and returns { ok, result }.

If allowDirectConnection is on, calls a pluggable saveIOU({debit, signature}) so providers can persist IOUs (DB/Redis/File).

ProviderClaimer

Loads pending IOUs, drops expired, groups by payer, sorts by nonce, selects consecutive window starting at nextNonce (or “latest-only” mode if enabled).

Enforces token allow-list & per-call limit, optionally checks unstake window.

Calls settleBatch and marks IOUs settled.

Express relayer (optional but handy)

/providers/register, /services — onboarding; mirrors EAS metadata off-chain for UX.

/call/:serviceId — server-side verification + IOU storage; calls provider webhook/WS.

/providers/claim — batch settlement trigger.

Built fast for the hackathon with in-memory stores; DAO interfaces are drop-in replaceable with Mongo.

Hosted Agent demo

“Create Agent” → returns a webhook URL + API key.

The endpoint accepts plain text, calls Gemini (gemini-1.5), and bills via the same EIP-712 path (per-1K-chars pricing).

Shows the platform can host providers too—without changing the payment rails.

Security & correctness

Auth: EIP-712; ERC-1271 path planned; strict type coercion (BigInt) pre-sign and pre-verify.

Replay safety: nonces per (payer, provider), epochs bumped on pause/unstake, short deadlines.

Caps: escrow budget gate + on-chain per-delta limit; token allow-list.

Unstake protection: after unstakeAt, settlements revert; server emits provider notices off-chain.

Transport hygiene: HMAC for webhooks, WS timeouts, schema checks, rate limits.

Testing & tooling

Hardhat scripts: single debit, batch, cumulative delta, unstake window.

Property tests (behavioral):

old nonce replays revert

amount < paidUpTo reverts

post-deadline settlement reverts

cumulative settles pay exact delta.

DX niceties: typed minimal ABIs for ethers v6, or TypeChain factories when running inside the Hardhat repo.
