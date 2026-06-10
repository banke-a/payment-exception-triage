# Payment Exception Triage

An AI-assisted triage layer for payment operations. It takes payment exceptions — transactions that did not complete cleanly — and reasons across conflicting signals from multiple systems to determine what broke, where, who holds the funds, and what to do, then prioritises the queue by expected irreversible loss.

This is an augmentation tool. The AI clears and prioritises the queue; humans own every decision that moves funds.

## The problem

As payment flows become more interconnected across banks, mobile money operators, and processors, a single break stops being isolated. A delayed confirmation or a missing status update creates uncertainty across reconciliation, customer experience, and cash flow. At scale, the cost is not that payments fail more often — it is that the cost of not knowing where a payment failed, who holds the funds, and how quickly it can be recovered grows with volume. This is a hidden tax on growth.

Exception triage is where that uncertainty is resolved, one case at a time. It is high volume, requires reasoning across messy multi-source data, and is slow and inconsistent when done manually. That makes it well suited to an AI augmentation layer.

## The prioritisation model

The core design decision in this tool is how it prioritises a queue. The naive approach — work the biggest amount first — is wrong, because a large amount sitting safely is not urgent, while a medium amount about to become permanently unrecoverable is.

Priority is modelled as **expected irreversible loss**:

```
priority = P(unrecoverable) × value_at_risk × (1 + customer_impact)
```

- **P(unrecoverable)** is a recoverability hazard. Ageing is the time term inside it: as the recovery window closes, the probability of permanent loss rises. This mirrors how a time horizon sits inside a probability of default.
- **value_at_risk** is the exposure currently in limbo.
- The product of the two is the expected loss — the irreversible-loss core.
- **customer_impact** is an overlay modifier. It can escalate a case but cannot manufacture priority where expected loss is near zero.

Because the core is multiplicative, a high value with negligible recoverability risk cannot mask its way to the top of the queue. That is the property that makes the prioritisation defensible rather than a black-box score.

## What is AI-assisted and what is not

The AI ingests the signals, classifies the failure, locates the break point, assesses recoverability, estimates funds location, drafts the resolution path, and prioritises. Any movement of funds or financial adjustment is routed to a human. Ambiguous cases, where signals conflict and confidence is low, are also routed to a human.

## Production notes

This demo uses synthetic transaction data. A production deployment for a regulated processor would require:

- A private LLM integration so that customer data does not leave the processor's environment, plus a data processing agreement.
- Recoverability probabilities calibrated against historical recovery data per corridor and failure type, rather than estimated. A processor already holds exactly this data.
- A unified transaction lifecycle view across the fragmented source systems. Triage quality is bounded by signal quality: the data foundation is the prerequisite, not the model.

## Running locally

```bash
npm install
cp .env.example .env   # add your Anthropic API key
netlify dev
```

Requires the Netlify CLI: `npm install -g netlify-cli`

## Deploying

Connect the repo to Netlify. Build settings are in `netlify.toml`. Add `ANTHROPIC_API_KEY` as an environment variable in the Netlify dashboard. The key is read server-side by the Netlify function and is never exposed to the browser.
