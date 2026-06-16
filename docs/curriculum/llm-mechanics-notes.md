# LLM Mechanics — Synthesized Notes

Synthesized notes from Andrej Karpathy's "Deep Dive into LLMs like ChatGPT" (~3.5h).
Read this first; watch the [full video](https://youtu.be/7xTGNNLPyMI) only if you want
the long-form depth. These notes give you the mechanical mental model that every later
course in this curriculum assumes.

## The two training stages

- **Pretraining.** The model is shown a vast slice of the internet and learns one
  thing: predict the next token. Everything it "knows" is compressed, lossy statistics
  over that text — not a database of facts. This is why it produces *plausible* text,
  not *true* text.
- **Post-training (SFT + RLHF).** A much smaller stage that shapes the pretrained model
  into a helpful assistant. It teaches *style and behaviour* (answer the question, refuse
  unsafe requests, follow instructions) — it does **not** add much new knowledge.

## Why models hallucinate

- The objective is "what token is likely next," never "is this true." A confident-sounding
  wrong answer and a confident-sounding right answer are produced by the *same* mechanism.
- Knowledge fades at the edges: well-represented facts (common, repeated on the web) are
  reliable; rare, recent, or private facts are where the model guesses most confidently.
- Mitigation is about *context, not trust*: give the model the source material (RAG,
  `@`-references, pasted docs) so the answer is grounded in tokens you control, and verify
  anything load-bearing.

## Working memory vs. knowledge

- **Knowledge** = baked into the weights at pretraining, frozen, often stale.
- **Working memory** = the context window, the only thing the model can "see right now."
  Most practical wins come from managing working memory well — this is what L2's Context
  Engineering reading makes operational.

## Why models are good at some things and bad at others

- **Good at:** pattern completion, transformation, summarizing/translating text in front
  of them, code with common idioms — anything well-represented in training data.
- **Bad at:** exact arithmetic, counting, precise recall of rare facts, and anything
  requiring a guarantee rather than a likely-looking answer.

## The one takeaway

The model is a next-token predictor with frozen, lossy knowledge and a sharp, controllable
working memory. Steer it by controlling what's in the context, and verify what matters —
this is the foundation for every level above.
