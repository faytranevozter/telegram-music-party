# Configurable web guest request limit

Hosts of web-created rooms can set **Tracks per guest** and **Limit period (minutes)** in **Room info & settings**. For example, `3` and `10` allow three tracks per rolling ten minutes. A value of `0` for tracks disables this rule; existing and new rooms default to `0` with a saved period of ten minutes. Hosts are exempt. Telegram-linked rooms and Telegram commands are out of scope.

The quota is per room and authenticated invite session. Reloading with the same session keeps the allowance; rejoining with a newly issued invite session starts fresh. Do not add accounts, IP tracking, or fingerprinting.

**Queue** and **Play Next** share the quota. The separate daily Play Next limit and room queue capacity are unchanged. Only accepted adds consume quota; rejected and duplicate requests do not. A track leaving the queue doesn’t refund its slot. When the limit is reached, tell the guest when they can try again and keep search and voting available.

## Approaches

- **Selected: rolling window.** Each accepted request ages out individually; there is no reset boundary that permits two immediate full batches.
- **Not selected: fixed reset or strict cooldown.** A fixed reset allows boundary bursts; a cooldown prevents legitimate small batches.

Accept whole-number settings: `0–100` tracks and `1–1440` minutes. When the limit is enabled, changes take effect for the next request without resetting history retained from prior enabled periods. Requests made with the rule disabled do not become retroactive quota usage. Use server time and keep quota records in Redis for at most 24 hours from each accepted request; do not use analytics as an enforcement dependency.
