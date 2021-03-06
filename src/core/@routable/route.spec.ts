import {
  NextFunction,
  Request,
  Response
}                          from 'express';
import * as request        from 'supertest';
import {
  testSapi,
  testUrl
}                          from '../../../spec/helpers/sakuraapi';
import {
  Db,
  Json,
  Model
}                          from '../@model';
import {SapiModelMixin}    from '../@model/sapi-model-mixin';
import {OK} from '../helpers/http-status';
import {
  AuthenticatorPlugin,
  AuthenticatorPluginResult,
  IAuthenticator,
  IAuthenticatorConstructor
}                          from '../plugins';
import {
  IRoutableLocals,
  Routable,
  routableSymbols,
  Route
}                          from './';
import {SapiRoutableMixin} from './sapi-routable-mixin';

describe('core/Route', () => {
  @Routable({
    baseUrl: 'testCoreRoute',
    blackList: ['someBlacklistedMethod']
  })
  class TestCoreRoute extends SapiRoutableMixin() {
    @Route({
      method: 'get',
      path: '/'
    })
    someMethod(req: Request, res: Response) {
      res
        .status(OK)
        .send({someMethodCalled: true});
    }

    @Route({
      method: 'post',
      path: 'someOtherMethod/'
    })
    someOtherMethod(req: Request, res: Response) {
      res
        .status(OK)
        .send({someOtherMethodCalled: true});
    }

    @Route({
      method: 'post',
      path: 'someBlacklistedMethod/'
    })
    someBlacklistedMethod(req: Request, res: Response) {
      res
        .status(OK)
        .send({someOtherMethodCalled: true});
    }

    @Route({
      method: 'post',
      path: 'methodStillWorks/'
    })
    methodStillWorks() {
      return 'it works';
    }

    @Route()
    emptyRouteDecorator() {
      // lint empty
    }
  }

  beforeEach(() => {
    this.t = new TestCoreRoute();
    this.routes = this.t[routableSymbols.routes];
  });

  it('gracefully handles an empty @Route(...), defaults path to baseUri/', () => {
    // if these expectations pass, the blackList was properly defaulted to false since
    // the route wouldn't be in sakuraApiClassRoutes if blackList had been true.
    expect(this.routes.length).toBe(4);
    expect(this.routes[3].path).toBe('/testCoreRoute');
    expect(this.routes[3].httpMethod).toBe('get');
    expect(this.routes[3].method).toBe('emptyRouteDecorator');
  });

  it('maintains the original functionality of the method', () => {
    const returnValue = this.routes[2].f();
    expect(returnValue).toBe('it works');
  });

  it('throws an exception when an invalid HTTP method is specificed', () => {
    let err;
    try {
      @Routable()
      class X {
        @Route({method: 'imnotarealhttpmethod'})
        badHttpMethod() {
          // lint empty
        }
      }
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });

  it('excludes a method level blacklisted @Route', () => {
    @Routable()
    class Test3 {
      @Route({blackList: true})
      blackListedMethod() {
        // lint empty
      }
    }

    const t3 = new Test3();
    expect(t3[routableSymbols.routes].length).toBe(0);
  });

  describe('handles route parameters', () => {

    @Routable({
      baseUrl: 'handlesRouteParamtersTest'
    })
    class HandlesRouteParamtersTest {
      @Route({
        method: 'get',
        path: '/route/parameter/:id'
      })
      testA(req, res) {
        res
          .status(OK)
          .json({result: req.params.id.toString()});
      }

      @Route({
        method: 'get',
        path: '/route2/:id/test'
      })
      testB(req, res) {
        res
          .status(OK)
          .json({result: req.params.id.toString()});
      }
    }

    const sapi = testSapi({
      models: [],
      routables: [HandlesRouteParamtersTest]
    });

    beforeEach((done) => {
      sapi
        .listen({bootMessage: ''})
        .then(done)
        .catch(done.fail);
    });

    afterEach((done) => {
      sapi
        .close()
        .then(done)
        .catch(done.fail);
    });

    it('at the end of the path', (done) => {
      request(sapi.app)
        .get(testUrl('/handlesRouteParamtersTest/route/parameter/777'))
        .expect('Content-Type', /json/)
        .expect('Content-Length', '16')
        .expect('{"result":"777"}')
        .expect(OK)
        .then(done)
        .catch(done.fail);
    });

    it('at the end of the path', (done) => {
      request(sapi.app)
        .get(testUrl('/handlesRouteParamtersTest/route2/888/test'))
        .expect('Content-Type', /json/)
        .expect('Content-Length', '16')
        .expect('{"result":"888"}')
        .expect(OK)
        .then(done)
        .catch(done.fail);
    });
  });

  describe('before', () => {

    @Routable({
      baseUrl: 'BeforeHandlerTests'
    })
    class BeforeHandlerTests {
      @Route({
        before: [(req, res, next) => {
          const reqLocals = res.locals as IRoutableLocals;
          reqLocals.send(OK, {
            order: '1b'
          });
          next();
        }]
      })
      testHandler(req: Request, res: Response, next: NextFunction) {
        const reqLocals = res.locals as IRoutableLocals;
        reqLocals.send(OK, {
          order: reqLocals.data.order + '2b'
        });
        next();
      }

      @Route({
        path: 'test2Handler'
      })
      test2Handler(req: Request, res: Response, next: NextFunction) {
        next();
      }
    }

    const sapi = testSapi({
      models: [],
      routables: [BeforeHandlerTests]
    });

    beforeEach((done) => {
      sapi
        .listen({bootMessage: ''})
        .then(done)
        .catch(done.fail);
    });

    afterEach((done) => {
      sapi
        .close()
        .then(done)
        .catch(done.fail);
    });

    it('runs before handler before route handler', (done) => {
      request(sapi.app)
        .get(testUrl('/BeforeHandlerTests'))
        .expect(OK)
        .then((result) => {
          expect(result.body.order).toBe('1b2b');
        })
        .then(done)
        .catch(done.fail);
    });

    it('does not run before handlers without before route handlers', (done) => {
      request(sapi.app)
        .get(testUrl(`/BeforeHandlerTests/test2Handler`))
        .expect(OK)
        .then((result) => {
          expect(result.body.order).toBeUndefined();
        })
        .then(done)
        .catch(done.fail);
    });
  });

  describe('after', () => {
    @Model({
      dbConfig: {
        collection: 'afterHandlerTestModel',
        db: 'userDb'
      }
    })
    class AfterHandlerTestModel extends SapiModelMixin() {
      @Db() @Json()
      firstName = 'George';

      @Db() @Json()
      lastName = 'Washinton';
    }

    @Routable({
      baseUrl: 'AfterHandlerTests'
    })
    class AfterHandlerTests {
      @Route({
        after: (req, res, next) => {
          AfterHandlerTestModel
            .getById(res.locals.data.id)
            .then((result) => {
              res.locals.send(OK, {
                dbObj: result,
                order: 1
              }, res);
              next();
            })
            .catch(next);
        }
      })
      testHandler(req: Request, res: Response, next: NextFunction) {
        const model = new AfterHandlerTestModel();

        model
          .create()
          .then((db: any) => {
            res.locals.send(OK, {
              id: db.insertedId
            }, res);
            next();
          })
          .catch(next);
      }

      @Route({
        path: '/test2Handler'
      })
      test2Handler(req: Request, res: Response, next: NextFunction) {
        next();
      }
    }

    const sapi = testSapi({
      models: [AfterHandlerTestModel],
      routables: [AfterHandlerTests]
    });

    beforeEach((done) => {
      sapi
        .listen({bootMessage: ''})
        .then(done)
        .catch(done.fail);
    });

    afterEach((done) => {
      sapi
        .close()
        .then(done)
        .catch(done.fail);
    });

    it('runs after handler after route handler', (done) => {
      request(sapi.app)
        .get(testUrl('/AfterHandlerTests'))
        .expect(OK)
        .then((result) => {
          const body = result.body;
          expect(body.dbObj.firstName).toBe('George');
          expect(body.dbObj.lastName).toBe('Washinton');
          expect(body.dbObj._id).toBe(body.id);
          expect(body.order).toBeDefined();
        })
        .then(done)
        .catch(done.fail);
    });

    it('does not run after handler after other handlers', (done) => {
      request(sapi.app)
        .get(testUrl('/AfterHandlerTests/test2Handler'))
        .expect(OK)
        .then((result) => {
          expect(result.body.order).toBeUndefined();
        })
        .then(done)
        .catch(done.fail);
    });
  });

  describe('authenticators', () => {
    @AuthenticatorPlugin()
    class RoutableAuthenticator implements IAuthenticator, IAuthenticatorConstructor {
      async authenticate(req: Request, res: Response): Promise<AuthenticatorPluginResult> {
        return {data: {}, status: OK, success: true};
      }
    }

    @AuthenticatorPlugin()
    class RouteAuthenticator implements IAuthenticator, IAuthenticatorConstructor {
      async authenticate(req: Request, res: Response): Promise<AuthenticatorPluginResult> {
        return {data: {}, status: OK, success: true};
      }
    }

    it('injects route authenticators array into @Routable metadata', () => {

      @Routable()
      class TestRoutable extends SapiRoutableMixin() {

        @Route({
          authenticator: [RouteAuthenticator]
        })
        testHandler() {

        }
      }

      const sapi = testSapi({
        routables: [TestRoutable]
      });

      const authenticators = Reflect.getMetadata('authenticators.testHandler', new TestRoutable());

      expect(authenticators).toBeDefined();
      expect(Array.isArray(authenticators)).toBeTruthy();
      expect(authenticators[0]).toBe(RouteAuthenticator);

    });

    it('injects route authenticator as array into @Routable metadata', () => {

      @Routable()
      class TestRoutable extends SapiRoutableMixin() {

        @Route({
          authenticator: RouteAuthenticator
        })
        testHandler() {

        }
      }

      const sapi = testSapi({
        routables: [TestRoutable]
      });

      const authenticators = Reflect.getMetadata('authenticators.testHandler', new TestRoutable());

      expect(authenticators).toBeDefined();
      expect(Array.isArray(authenticators)).toBeTruthy();
      expect(authenticators[0]).toBe(RouteAuthenticator);

    });

    it('injects empty with no authenticators into @Routable metadata', () => {

      @Routable()
      class TestRoutable extends SapiRoutableMixin() {

        @Route()
        testHandler() {
        }
      }

      const sapi = testSapi({
        routables: [TestRoutable]
      });

      const authenticators = Reflect.getMetadata('authenticators.testHandler', new TestRoutable());

      expect(authenticators).toBeDefined();
      expect(Array.isArray(authenticators)).toBeTruthy();
      expect(authenticators.length).toBe(0);

    });
  });
});
