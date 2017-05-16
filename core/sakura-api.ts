import {SakuraApiConfig} from '../boot/sakura-api-config';
import {SakuraMongoDbConnection} from './sakura-mongo-db-connection';
import * as express from 'express';
import {
  ErrorRequestHandler,
  Express,
  Handler,
  NextFunction,
  Request,
  Response
} from 'express';
import {
  ISakuraApiClassRoutes,
  routableSymbols
} from './@routable';
import * as http from 'http';
import debug = require('debug');

/**
 * A set of properties defining the configuration of the server.
 */
export interface ServerConfig {
  /**
   * An Express compatible address for the server to bind to.
   */
  address?: string;
  /**
   * An Express compatible port for the server to bind to.
   */
  port?: number;
  /**
   * A message that you'd like printed to the screen when the server is started.
   */
  bootMessage?: string;
}

/**
 * SakuraApi is responsible for:
 * 1. Instantiating Express.js.
 * 2. Loading the server's configuration via [[SakuraApiConfig]]
 * 3. Taking routes from `@Routable` decorated classes ([[Routable]]) and binding those routes to Express.
 * 4. Starting and stopping the server.
 *
 * You'll want to instantiate SakuraApi and export SakuraApi then import that to anywhere that requires a reference
 * to that instance (for example [[Model]] or [[Routable]]).
 *
 * ### Example
 * <pre>
 * import {SakuraApi}       from 'sakuraapi';
 * import                   './model/user';
 * import                   'colors';
 * import * as bodyParser   from 'body-parser'
 *
 * export const sapi = new SakuraApi();
 *
 * class Server {
 *
 *    constructor() {}
 *
 *    start() {
 *        sapi.addMiddleware(bodyParser.json());
 *        sapi
 *          .listen()
 *          .catch((err) => {
 *            console.log(`Error: ${err}`.red);
 *          });
 *    }
 * }
 *
 * new Server().start();
 * </pre>
 *
 * This example assumes you have a class called `User` that is decorated with [[Routable]]. You import that module
 * even though you're not going to use it do that it kicks off the `@Routable` bootstrapping.
 */
export class SakuraApi {

  private static debug = {
    normal: debug('sapi:SakuraApi'),
    route: debug('sapi:route')
  };
  private debug = SakuraApi.debug;

  private _address: string = '127.0.0.1';
  private _app: Express;
  private _config: any;
  private _dbConnections: SakuraMongoDbConnection;
  private _port: number = 3000;
  private _server: http.Server;
  private lastErrorHandlers: ErrorRequestHandler[] = [];
  private routes = new Map<string, ISakuraApiClassRoutes>();

  /**
   * Sets the baseUri for the entire application.
   *
   * ### Example
   * <pre>
   * sakuraApi.baseUri = '/api';
   * </pre>
   *
   * This will cause SakuraApi to expect all routes to have `api` at their base (e.g., `http://localhost:8080/api/user`).
   */
  baseUri = '/';

  /**
   * Returns the address of the server as a string.
   */
  get address(): string {
    return this._address;
  }

  /**
   * Returns an reference to SakuraApi's instance of Express.
   */
  get app(): Express {
    return this._app;
  }

  /**
   * Returns an instance of the Config that was automatically loaded during SakuraApi's instantiation using [[SakuraApiConfig.load]].
   * You can also set the instance, but keep in mind that you should probably do this before calling [[SakuraApi.listen]].
   */
  get config(): any {
    return this._config;
  }

  set config(config: any) {
    this._config = config;
  }

  /**
   * The [[SakuraMongoDbConnection]] instance that was created when [[SakuraApi]] instantiated if
   * the "dbConnections" property was found in the config with the proper configuration options set, or
   * if [[SakuraApi.instantiate]] was used to instantiate the [[SakuraApi]] singleton and the
   * [[SakuraMongoDbConnection]] was manually provided.
   */
  get dbConnections(): SakuraMongoDbConnection {
    return this._dbConnections;
  }

  /**
   * Returns the port the server is listening on.
   */
  get port(): number {
    return this._port;
  }

  /**
   * Returns a reference to the `http.Server` that SakuraApi is using.
   */
  get server(): http.Server {
    return this._server;
  }

  constructor(app?: Express, config?: any, dbConfig?: SakuraMongoDbConnection) {
    this.debug.normal('.constructor started');

    if (!app) {
      app = express();
    }

    if (!config) {
      config = new SakuraApiConfig().load() || {};
    }

    if (!dbConfig) {
      this._dbConnections = SakuraApiConfig.dataSources(config);
    }

    this._app = app;
    this._server = http.createServer(this.app);

    this.config = config;
    this._address = (this.config.server || {}).address || this._address;
    this._port = (this.config.server || {}).port || this._port;

    this.debug.normal('.constructor done');
  }

  /**
   * A helper method to make it easier to add middleware. See [[SakuraApi]] for an example of its use. You could also
   * use [[SakuraApi.app]] to get a reference to Express then add your middleware with that reference directly.
   *
   * This uses `express.use(...)` internally.
   */
  addMiddleware(fn: (req: Request, res: Response, next: NextFunction) => void) {
    SakuraApi.debug.normal('.addMiddleware called');
    this.app.use(fn);
  }

  addLastErrorHandlers(fn: ErrorRequestHandler) {
    SakuraApi.debug.normal('.addMiddleware called');
    this.lastErrorHandlers.push(fn);
  }

  /**
   * Gracefully shuts down the server. It will not reject if the server is not running. It will, however, reject
   * with any error other than `Not running` that's returned from the `http.Server` instance.
   */
  close(): Promise<null> {
    this.debug.normal('.close called');

    return new Promise((resolve, reject) => {
      this
        .server
        .close((err) => {
          if (err && err.message !== 'Not running') {
            this.debug.normal('.close error', err);

            return reject(err);
          }
          this.debug.normal('.close done');

          resolve();
        });
    });
  }

  /**
   * Starts the server. You can override the settings loaded by [[SakuraApiConfig]] by passing in
   * an object that implements [[ServerConfig]].
   *
   * Connects to all the DB connections (if any) defined in [[SakuraApi.dbConnections]]. These are loaded
   * by [[SakuraApiConfig.dataSources]]. If you do not provide a "dbConnections" property in your config, or if you
   * did not instantiate SakuraApi manually with [[SakuraApi.instiate]] with a [[SakuraMongoDbConnection]] that
   * you constructed elsewhere, then no DB connections will be opened. You can also user [[SakuraMongoDbConnection.connect]]
   * to manually define Db connections.
   */
  listen(listenProperties?: ServerConfig): Promise<null> {
    this.debug.normal(`.listen called with serverConfig:`, listenProperties);

    listenProperties = listenProperties || {};
    this._address = listenProperties.address || this._address;
    this._port = listenProperties.port || this._port;

    return new Promise((resolve, reject) => {

      handlerErrors.bind(this)();
      setupRoutes.bind(this)();

      if (this.dbConnections) {
        this
          .dbConnections
          .connectAll()
          .then(() => {
            listen.bind(this)();
          })
          .catch((err) => {
            return reject(err);
          })
      } else {
        listen.bind(this)();
      }

      //////////
      function handlerErrors() {
        this.app.use(function(err, req, res, next) {
          // Body Parser json error hack
          // see: https://github.com/expressjs/body-parser/issues/238#issuecomment-294161839
          if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
            res.status(400).send({
              error: 'invalid_body',
              body: req.body
            });
          } else {
            next(err);
          }
        });
      }

      function setupRoutes() {
        // see: https://github.com/expressjs/express/issues/2596#issuecomment-81353034
        let router = undefined;

        this.debug.normal(`.listen setting baseUri to ${this.baseUri}`);
        this.app.use(this.baseUri, function(req, res, next) {
          router(req, res, next); // hook whatever the current router is
        });

        router = express.Router();

        for (let route of this.routes.values()) {
          let routeHandlers: Handler[] = [];

          if (route.beforeAll) {
            routeHandlers = routeHandlers.concat(route.beforeAll);
          }

          routeHandlers.push(route.f);

          if (route.afterAll) {
            routeHandlers = routeHandlers.concat(route.afterAll);
          }

          router[route.httpMethod](route.path, routeHandlers);
        }

        if (this.lastErrorHandlers) {
          for (let handler of this.lastErrorHandlers) {
            this.app.use(handler);
          }
        }
      }

      function listen() {
        this
          .server
          .listen(this.port, this.address, (err) => {
            if (err) {
              this.debug.normal('.listen error', err);
              return reject(err);
            }

            if (listenProperties.bootMessage === undefined) {
              console.log(`SakuraAPI started on: ${this.address}:${this.port}`.green);
            } else {
              let msg = (listenProperties.bootMessage === '')
                ? false
                : listenProperties.bootMessage;

              if (msg) {
                process.stdout.write(`${msg}`.green);
              }
            }

            this.debug.normal(`.listen server started ${this.address}:${this.port}`);
            return resolve();
          });
      }
    });
  }

  /**
   * Primarily used internally by [[Routable]] during bootstrapping. However, if an `@Routable` class has [[RoutableClassOptions.autoRoute]]
   * set to false, the integrator will have to pass that `@Routable` class in to this method manually if he wants to routes to be
   * bound.
   */
  route(target: any) {

    this.debug.route(`SakuraApi.route called for %o`, target);

    if (!target[routableSymbols.sakuraApiClassRoutes]) {
      this.debug.route(`.route '%o' is not a routable class`, target);
      return;
    }

    for (const route of target[routableSymbols.sakuraApiClassRoutes]) {
      this.debug.route(`\tadded '${JSON.stringify(route)}'`);

      const routeSignature = `${route.httpMethod}:${route.path}`;
      if (this.routes.get(routeSignature)) {
        throw new Error(`Duplicate route (${routeSignature}) registered by ${target.name || target.constructor.name}.`);
      }

      // used by this.listen
      this.routes.set(routeSignature, route);
    }
  }
}