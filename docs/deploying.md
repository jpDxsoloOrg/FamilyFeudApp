# Deploying

The whole app (DynamoDB table, AppSync API, Lambda, static site) is one SST v3 stack.
Every stage is a fully separate copy.

## Stages

| Stage | Purpose | How it deploys |
|-------|---------|----------------|
| `dev` | Shared test stage | By hand: `AWS_PROFILE=league-szn npx sst deploy --stage dev` |
| `production` | The one hosts use | GitHub Actions on every push to `main` (see below), or by hand with `--stage production` |
| `<yourname>` | Personal sandbox | `npx sst dev` or `npx sst deploy --stage <yourname>` |

Account `435238036810`, region `us-east-1`, AWS profile `league-szn`. First time on a machine:

```sh
npm install
npx sst install          # fetches the pulumi providers (aws, random)
```

A deploy prints the stack outputs: `site` (CloudFront URL), `api`, `apiRealtime`, `apiKey`.
The API key is baked into the site bundle and is not a secret; the host token returned by
`createGame` is what authorises anything.

## GitHub Actions

- `.github/workflows/ci.yml` runs typecheck, tests and the frontend build on every pull request
  and push to `main`.
- `.github/workflows/deploy.yml` deploys `production` on every push to `main`, and can be run by
  hand for any stage from the Actions tab (workflow_dispatch → `stage`).

It needs, in the repository settings:

- **Secrets** (Settings → Secrets and variables → Actions): `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY` for an IAM user allowed to deploy (the `league-szn` credentials work).
  Consider a GitHub *environment* named `production` with those secrets and a required reviewer,
  since the workflow declares `environment: production`.
- **Variables** (optional): `SITE_DOMAIN` and `SITE_CERT_ARN` for a custom domain.

```sh
gh secret set AWS_ACCESS_KEY_ID --body "<key id>"
gh secret set AWS_SECRET_ACCESS_KEY --body "<secret>"
```

## Custom domain

`jpdxsolo.com` DNS is managed in Namecheap, so SST cannot create records itself. To serve the site
on, say, `feud.jpdxsolo.com`:

1. In ACM (**us-east-1**, CloudFront requires it) request a certificate for `feud.jpdxsolo.com`,
   add the DNS validation CNAME in Namecheap, wait for *Issued*, copy the certificate ARN.
2. Deploy with `SITE_DOMAIN=feud.jpdxsolo.com SITE_CERT_ARN=arn:aws:acm:us-east-1:...` in the
   environment (or set them as the GitHub variables above). `sst.config.ts` passes them to the
   StaticSite with `dns: false`.
3. In Namecheap add `CNAME feud → <the stack's CloudFront domain>` (the `site` output without
   `https://`).

The API stays on its AppSync URL; the site bundle carries it.

## Removing a stage

```sh
npx sst remove --stage <name>
```

`production` is configured with `removal: "retain"`, so its table survives a remove.
