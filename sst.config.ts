/// <reference path="./.sst/platform/config.d.ts" />

// NOTE: run `npx sst install` once to generate .sst/platform types.
// This file is excluded from workspace typechecking until then.

export default $config({
  app(input) {
    return {
      name: "familyfeud",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const table = new sst.aws.Dynamo("Table", {
      fields: { pk: "string", sk: "string" },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    });

    const api = new sst.aws.AppSync("Api", {
      schema: "graphql/schema.graphql",
    });

    const lambdaSource = api.addDataSource({
      name: "lambda",
      lambda: {
        handler: "packages/functions/src/resolver.handler",
        link: [table],
      },
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
    ];
    const queries = ["game", "hostGame", "fastMoneyView"];

    for (const field of mutations) {
      api.addResolver(`Mutation ${field}`, { dataSource: lambdaSource.name });
    }
    for (const field of queries) {
      api.addResolver(`Query ${field}`, { dataSource: lambdaSource.name });
    }

    const site = new sst.aws.StaticSite("Site", {
      path: "packages/frontend",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_GRAPHQL_URL: api.url,
      },
    });

    return {
      api: api.url,
      site: site.url,
    };
  },
});
