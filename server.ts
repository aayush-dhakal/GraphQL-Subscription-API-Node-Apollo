import express from "express";
import { createServer } from "http";
import { PubSub } from "graphql-subscriptions";
import gql from "graphql-tag";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { expressMiddleware } from "@apollo/server/express4";
import cors from "cors";
import bodyParser from "body-parser";

// Asnychronous Anonymous Function
// Inside of server.ts -> await keyword

(async function () {
  // Server code in here!
  const pubsub = new PubSub(); // Publish and Subscribe, Publish -> everyone gets to hear it
  const app = express();
  const httpServer = createServer(app);

  // GraphQL Typedefs and resolvers
  const typeDefs = gql`
    type NewsEvent {
      title: String
      description: String
    }

    type Query {
      # just some random things because we have to define something in it
      placeholder: Boolean
    }

    type Mutation {
      createNewsEvent(title: String, description: String): NewsEvent
    }

    type Subscription {
      # to liten to news events. we will get the NewsEvent which will have title and description in it
      newsFeed: NewsEvent # newsFeed is our subscription name
    }
  `;

  interface createNewsEventInput {
    title: string;
    description: string;
  }

  const resolvers = {
    Query: {
      placeholder: () => {
        return true; // just returning something for the sake of defining it
      },
    },
    Mutation: {
      // we don't have parents here so defining its type as any
      createNewsEvent: (_parent: any, args: createNewsEventInput) => {
        console.log(args);
        // creating a publication called EVENT_CREATED
        pubsub.publish("EVENT_CREATED", { newsFeed: args }); // we are publishing to our defined newsFeed subscription

        // Save news events to a database: you can do that here!

        // Create something : EVENT_CREATED
        // Subscribe to something: EVENT_CREATED
        return args;
      },
    },
    Subscription: {
      newsFeed: {
        // subscribing to event EVENT_CREATED and receiving its data
        subscribe: () => pubsub.asyncIterator(["EVENT_CREATED"]),
      },
    },
  };

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // ws Server
  // subscription will run on web socket server not on http server
  const wsServer = new WebSocketServer({
    server: httpServer, // making our web socket run over the layer of http server
    // making the web socket server run only on path /graphql
    path: "/graphql", // localhost:3000/graphql
  });

  const serverCleanup = useServer({ schema }, wsServer); // dispose

  // apollo graphql server
  const server = new ApolloServer({
    schema,
    plugins: [
      // By using ApolloServerPluginDrainHttpServer, you can ensure that your Apollo Server shuts down gracefully, preventing any data loss or unexpected behavior. ApolloServerPluginDrainHttpServer is a plugin for Apollo Server that allows you to gracefully shut down your HTTP server. This is especially important if you are using a framework like Express or Koa, as these frameworks do not automatically handle server draining. When you use ApolloServerPluginDrainHttpServer, Apollo Server will wait for all in-progress HTTP requests to finish before shutting down the server. This ensures that your clients receive their responses and that your server does not exit prematurely.
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  // start our server
  await server.start();

  // apply middlewares (cors, expressmiddlewares)
  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    bodyParser.json(),
    expressMiddleware(server) // this bascially says to run apollo graphql server to run on express server
  );

  // http server start
  httpServer.listen(4000, () => {
    console.log("Server running on http://localhost:" + "4000" + "/graphql");
  });
})();
