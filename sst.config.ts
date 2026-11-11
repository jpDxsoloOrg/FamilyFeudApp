/// <reference path="./.sst/platform/config.d.ts" />

// NOTE: run `npx sst install` once to generate .sst/platform types.
// This file is excluded from workspace typechecking until then.

export default $config({
  app(input) {
    return {
      name: "familyfeud",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      // `random` mints the Lambda's internal secret (see below); run `npx sst install` after changing this.
      providers: { random: "4.16.6" },
    };
  },
  async run() {
    const table = new sst.aws.Dynamo("Table", {
      fields: { pk: "string", sk: "string" },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      // Chat messages carry an expiresAt (epoch seconds) so Dynamo sweeps them.
      ttl: "expiresAt",
    });

    const api = new sst.aws.AppSync("Api", {
      schema: "graphql/schema.graphql",
    });

    // The API defaults to API_KEY auth but ships without a key, so nothing can
    // call it until we make one. AppSync caps a key at 365 days and refuses a
    // date in the past; rounding the expiry to the start of a UTC month keeps
    // it ~a year out while only changing the plan once a month.
    const keyExpiry = new Date();
    const apiKey = new aws.appsync.ApiKey("ApiKey", {
      apiId: api.id,
      description: `familyfeud ${$app.stage}`,
      expires: new Date(Date.UTC(keyExpiry.getUTCFullYear() + 1, keyExpiry.getUTCMonth(), 1))
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z"),
    });

    // Private per-player messages (YOU_ARE_UP, BUZZ_RESULT, ...) are published by
    // the Lambda calling its own API's `sendPlayerMessage` mutation, which is what
    // makes AppSync fan them out. That self-call is authorised by this secret
    // rather than a host token the Lambda does not have.
    const internalSecret = new random.RandomPassword("InternalSecret", {
      length: 40,
      special: false,
    });
    // The Lambda cannot be given `api.url` directly (the API depends on the
    // Lambda), so the URL + key are parked in SSM under a fixed name it reads
    // lazily at runtime.
    const apiParamName = `/familyfeud/${$app.stage}/api`;

    const lambdaSource = api.addDataSource({
      name: "lambda",
      lambda: {
        handler: "packages/functions/src/resolver.handler",
        // `link` grants IAM; the handlers read the plain table name from TABLE_NAME.
        link: [table],
        environment: {
          TABLE_NAME: table.name,
          INTERNAL_SECRET: internalSecret.result,
          API_PARAM_NAME: apiParamName,
        },
        permissions: [{ actions: ["ssm:GetParameter"], resources: ["*"] }],
      },
    });

    new aws.ssm.Parameter("ApiParam", {
      name: apiParamName,
      type: "String",
      value: $jsonStringify({ url: api.url, key: apiKey.key }),
    });

    const mutations = [
      "createGame",
      "joinGame",
      "updateConfig",
      "randomizeTeams",
      "setTeamName",
      "assignPlayer",
      "reorderPlayer",
      "removePlayer",
      "restorePlayer",
      "upsertSurvey",
      "deleteSurvey",
      "upsertFastMoneyQuestion",
      "deleteFastMoneyQuestion",
      "setLineupPins",
      "startRound",
      "skipContestant",
      "armBuzzers",
      "resetBuzzers",
      "revealAnswer",
      "strike",
      "setFaceOffWinner",
      "choosePassOrPlay",
      "skipGuesser",
      "endRound",
      "undoRoundAction",
      "buzz",
      "selectFastMoneyPlayers",
      "startFastMoneyTurn",
      "endFastMoneyTurn",
      "submitFastMoneyAnswer",
      "skipFastMoneyQuestion",
      "buzzDuplicate",
      "revealFastMoneyAnswer",
      "finishGame",
      "sendPlayerMessage",
      "sendTeamMessage",
    ];
    const queries = ["game", "hostGame", "fastMoneyView", "teamMessages"];

    for (const field of mutations) {
      api.addResolver(`Mutation ${field}`, { dataSource: lambdaSource.name });
    }
    for (const field of queries) {
      api.addResolver(`Query ${field}`, { dataSource: lambdaSource.name });
    }

    // Optional custom domain. DNS for jpdxsolo.com lives in Namecheap, not
    // Route 53, so SST cannot create the records: set SITE_DOMAIN and the ARN
    // of a validated us-east-1 ACM certificate (SITE_CERT_ARN), then point a
    // CNAME at the CloudFront domain this stack outputs. Unset → CloudFront URL.
    const siteDomain = process.env.SITE_DOMAIN;
    const siteCert = process.env.SITE_CERT_ARN;

    const site = new sst.aws.StaticSite("Site", {
      path: "packages/frontend",
      build: {
        command: "npm run build",
        output: "dist",
      },
      ...(siteDomain && siteCert ? { domain: { name: siteDomain, dns: false, cert: siteCert } } : {}),
      environment: {
        VITE_GRAPHQL_URL: api.url,
        VITE_GRAPHQL_REALTIME_URL: api.nodes.api.uris["REALTIME"],
        VITE_GRAPHQL_API_KEY: apiKey.key,
      },
    });

    return {
      api: api.url,
      apiRealtime: api.nodes.api.uris["REALTIME"],
      apiKey: apiKey.key,
      site: site.url,
    };
  },
});
