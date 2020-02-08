import fetch from "node-fetch";
import { Sade } from "sade";
import { join } from "path";
import { from, combineLatest } from "rxjs";
import { rm } from "../utils/fs";
import { mergeMap, share, tap, filter } from "rxjs/operators";
import QueryManager from "../graphql/QueryManager";
import { build as buildEntry } from "../generators/entry";
import { build as buildRoutes } from "../generators/routes";
import { build as buildBundle } from "../generators/bundle";
import { build as buildTemplate } from "../generators/template";
import { build as buildPages } from "../generators/pages";
import Logger, { DefaultLogger } from "../utils/logger";
import renderer from "../renderer";
import GraphQLClient from "../graphql/GraphQLClient";

export const commandDefinition = (prog: Sade) => {
  return prog
    .command("build")
    .describe("Build a static version of your website")
    .action(opts => {
      const { execute } = require("./scripts/build.js");
      const logger = new DefaultLogger();
      execute({
        ...opts,
        logger
      });
    });
};

export type ExecuteOptions = {
  logger: Logger;
};

export const execute = (opts: ExecuteOptions) => {
  return from(rm(join(process.cwd(), "build")))
    .pipe(
      mergeMap(() => {
        const queryManager = new QueryManager();

        const entry$ = buildEntry(
          {
            output: join(process.cwd(), ".sveet/index.js")
          },
          { entry: join("../src/index.js") }
        );

        const routes$ = buildRoutes({
          output: join(process.cwd(), ".sveet/routes.js")
        });

        const bundle$ = combineLatest(entry$, routes$).pipe(
          mergeMap(([entry, routes]) =>
            buildBundle({
              queryManager,
              client: {
                input: entry,
                outputDir: join(process.cwd(), "build/static")
              },
              ssr: {
                input: join(process.cwd(), "src/ssr.js"),
                outputDir: join(process.cwd(), "build/server")
              }
            })
          ),
          tap(event => {
            switch (event.type) {
              case "CompileEvent":
                opts.logger.log(`Compiling…`);
                break;
              case "ErrorEvent":
                opts.logger.error(`Compilation failed.`, event.error);
                break;
              case "ReadyEvent":
                opts.logger.log(`Files compiled successfully`);
                break;
            }
          }),
          share(),
          filter(event => event.type === "ReadyEvent")
        );

        const template$ = buildTemplate({
          templatePath: join(process.cwd(), "src/template.html")
        });

        const client = new GraphQLClient({
          uri: "https://swapi-graphql.netlify.com/.netlify/functions/index",
          fetch: fetch
        });

        return combineLatest(bundle$, template$).pipe(
          mergeMap(([bundle, template]) => {
            return buildPages({
              renderer: renderer({
                template: template.toString(),
                rendererPath: join(process.cwd(), "build/server/ssr.js"),
                manifestPath: join(process.cwd(), "build/manifest.json")
              }),
              queryManager: queryManager,
              client: client
            });
          })
        );
      })
    )
    .subscribe(
      () => {},
      (error: Error) => {
        opts.logger.error(`An unexpected error occurred.`, error);
      },
      () => {
        opts.logger.log(`Script completed successfully`);
      }
    );
};