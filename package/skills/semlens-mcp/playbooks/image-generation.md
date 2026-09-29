# Studio image generation

- Plugin starter omits Studio. Use authenticated CLI or manual full profile;
  never configure both.
- Inspect capability/auth. Studio draft is not Agent Draft; revision-save it.
- Quote exact model/variants/credits and obtain approval. Use returned references
  only. Local files use `semlens studio reference upload`; preserve request IDs.
- Start with stable `clientRequestId` and external approval. After uncertainty,
  inspect the same run. Stop/retry are separate; `cancel_requested` is not final.
- Retrieve matching PNG/JPEG/WebP. Inspect composition/workspace before editing;
  opening one needs approval and may require active access. Preview pixels and
  honor destination permission/freshness.
