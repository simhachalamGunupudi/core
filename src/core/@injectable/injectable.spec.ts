import {
  NextFunction,
  Request,
  Response
}                   from 'express';
import * as request from 'supertest';
import {
  testSapi,
  testUrl
}                   from '../../../spec/helpers/sakuraapi';
import {
  Json,
  Model,
  SapiModelMixin
}                   from '../@model';
import {
  IRoutableLocals,
  Routable,
  Route,
  SapiRoutableMixin
}                   from '../@routable';
import {OK}         from '../helpers';
import {SakuraApi}  from '../sakura-api';
import {
  Injectable,
  injectableSymbols,
  NonInjectableConstructorParameterError,
  ProviderNotRegistered,
  ProvidersMustBeDecoratedWithInjectableError
}                   from './injectable';

/* tslint:disable:no-shadowed-variable */

describe('@Injectable', () => {

  describe('Error handling', () => {
    @Injectable()
    class TestInjectable {

    }

    let sapi: SakuraApi;

    beforeEach(() => {
      sapi = testSapi({
        providers: [
          TestInjectable
        ]
      });
    });

    afterEach(() => {
      sapi.deregisterDependencies();
    });

    it('decorates @Injectable class', () => {
      expect(TestInjectable[injectableSymbols.isSakuraApiInjectable]).toBeTruthy();
      expect(TestInjectable[injectableSymbols.id].split('-').length).toBe(5);
      expect(() => TestInjectable[injectableSymbols.id] = null).toThrowError(`Cannot assign to read only ` +
        `property 'Symbol(injectableId)' of function '[object Function]'`);
    });

    it('is initialized by SakuraApi', () => {
      expect(TestInjectable[injectableSymbols.sapi].constructor.name).toBe('SakuraApi');
      expect(sapi.getProvider(TestInjectable) instanceof TestInjectable)
        .toBeTruthy('should have been added to provider map');
    });

    it('does not allow non @Injectable constructor args', () => {
      class NotInjectable {
      }

      @Injectable()
      class BrokenInjectable {
        constructor(private ni: NotInjectable, private ni1: NotInjectable) {
        }
      }

      @Injectable()
      class BrokenInjectable2 {
        constructor(s: string) {
          // lint empty
        }
      }

      expect(() => {
        const altSapi = testSapi({
          providers: [BrokenInjectable]
        });

        altSapi.getProvider(BrokenInjectable);
      }).toThrowError(NonInjectableConstructorParameterError);

      expect(() => {
        const altSapi = testSapi({
          providers: [BrokenInjectable2]
        });

        altSapi.getProvider(BrokenInjectable2);
      }).toThrowError(NonInjectableConstructorParameterError);

    });

    describe('SakuraApi.getProvider', () => {
      it('does not allow a non @Injectable in sapi.getProvider', () => {
        expect(() => sapi.getProvider('test')).toThrowError(ProvidersMustBeDecoratedWithInjectableError);
        expect(() => sapi.getProvider('')).toThrowError(ProvidersMustBeDecoratedWithInjectableError);
        expect(() => sapi.getProvider(1)).toThrowError(ProvidersMustBeDecoratedWithInjectableError);
        expect(() => sapi.getProvider({})).toThrowError(ProvidersMustBeDecoratedWithInjectableError);
        expect(() => sapi.getProvider(null)).toThrowError(ProvidersMustBeDecoratedWithInjectableError);
        expect(() => sapi.getProvider(undefined)).toThrowError(ProvidersMustBeDecoratedWithInjectableError);
      });

      it('throws ProviderNotRegistered when attempting to get unregistered provider', () => {
        @Injectable()
        class Invalid {
        }

        expect(() => sapi.getProvider(Invalid)).toThrowError(ProviderNotRegistered);
      });
    });
  });

  describe('DI scenarios', () => {
    it('A -> B', () => {

      @Injectable()
      class A {
        test(): string {
          return 'found';
        }
      }

      @Injectable()
      class B {
        constructor(private a: A) {
        }

        test() {
          return this.a.test();
        }
      }

      const altSapi = testSapi({
        providers: [A, B]
      });

      const b = altSapi.getProvider(B);
      expect(b.test()).toBe('found');
    });

    it('A -> B -> C', () => {

      @Injectable()
      class A {
        test(): string {
          return 'found';
        }
      }

      @Injectable()
      class B {
        constructor(private a: A) {
        }

        test() {
          return this.a.test();
        }
      }

      @Injectable()
      class C {
        constructor(private b: B) {
        }

        test() {
          return this.b.test();
        }
      }

      const altSapi = testSapi({
        providers: [A, B, C]
      });

      const c = altSapi.getProvider(C);
      expect(c.test()).toBe('found');
    });

    it('C -> B && C -> A && B -> A', () => {

      @Injectable()
      class C {
        hasC() {
          return 'C';
        }
      }

      @Injectable()
      class B {
        constructor(public c: C) {

        }

        hasB() {
          return 'B';
        }

      }

      @Injectable()
      class A {
        constructor(public b: B, public c: C) {
        }

        hasA() {
          return 'A';
        }

      }

      const altSapi = testSapi({
        providers: [A, B, C]
      });

      const a = altSapi.getProvider(A);
      expect(a.hasA()).toBe('A');
      expect(a.b.hasB()).toBe('B');
      expect(a.c.hasC()).toBe('C');

      const b = altSapi.getProvider(B);
      expect(b.hasB()).toBe('B');
      expect(b.c.hasC()).toBe('C');
    });

    it('allows mocking', () => {
      @Injectable()
      class A {
        constructor() {
          // lint empty
        }

        doSomething() {
          return 'real';
        }
      }

      @Injectable()
      class B {
        constructor(public a: A) {
        }

        doSomething() {
          return 'real';
        }

      }

      @Injectable()
      class C {
        constructor(public b: B) {
        }

        doSometing() {
          return 'real';
        }
      }

      @Injectable()
      class AMock {
        doSomething() {
          return 'mock';
        }
      }

      @Injectable()
      class CMock {
        constructor(public b: B) {
        }

        doSomething() {
          return 'mock';
        }
      }

      const sapi = testSapi({
        providers: [
          {use: AMock, for: A},
          B,
          {use: CMock, for: C}
        ]
      });

      const a = sapi.getProvider(A);
      expect(a.doSomething()).toBe('mock');

      const b = sapi.getProvider(B);
      expect(b.doSomething()).toBe('real');
      expect(b.a.doSomething()).toBe('mock');

      const c = sapi.getProvider(C);
      expect(c.doSomething()).toBe('mock');
      expect(c.b.doSomething()).toBe('real');
      expect(c.b.a.doSomething()).toBe('mock');
    });
  });

  describe(`@Model`, () => {

    @Injectable()
    class TestService {
      val = 'found';
    }

    @Injectable()
    class TestServiceMock {
      val = 'mock';
    }

    @Model()
    class TestModel extends SapiModelMixin() {

      @Json()
      test: string;

      constructor(private testService: TestService) {
        super();
        this.test = testService.val;
      }
    }

    let sapi: SakuraApi;
    afterEach(() => {
      sapi.deregisterDependencies();
    });

    it('supports injection', () => {
      sapi = testSapi({
        models: [TestModel],
        providers: [TestService]
      });

      const result = TestModel.fromJson({});
      expect(result.test).toBe('found');
    });

    it('supports mocking', () => {
      sapi = testSapi({
        models: [TestModel],
        providers: [{for: TestService, use: TestServiceMock}]
      });

      const result = TestModel.fromJson({});
      expect(result.test).toBe('mock');
    });
  });

  describe('@Routable', () => {
    @Injectable()
    class TestService {
      val = 'found';
    }

    @Injectable()
    class TestServiceMock {
      val = 'mock';
    }

    @Routable({
      baseUrl: 'injectRoutableTest'
    })
    class AnApi extends SapiRoutableMixin() {

      constructor(private testService: TestService) {
        super();
      }

      @Route({
        method: 'get',
        path: '/'
      })
      handleGet(req: Request, res: Response, next: NextFunction) {
        const resLocals = res.locals as IRoutableLocals;
        resLocals.send(OK, {
          result: this.testService.val
        });
        next();
      }
    }

    let sapi: SakuraApi;
    afterEach(async (done) => {
      try {
        await sapi.close();
        sapi.deregisterDependencies();
        done();
      } catch (err) {
        done.fail(err);
      }
    });

    it('supports injection', async (done) => {
      try {
        sapi = testSapi({
          providers: [TestService],
          routables: [AnApi]
        });

        await sapi.listen({bootMessage: ''});

        const result = await request(sapi.app)
          .get(testUrl('/injectRoutableTest'))
          .expect(OK);

        expect(result.body.result).toBe('found');

        done();
      } catch (err) {
        done.fail(err);
      }
    });

    it('supports mocking', async (done) => {
      try {
        sapi = testSapi({
          providers: [{for: TestService, use: TestServiceMock}],
          routables: [AnApi]
        });

        await sapi.listen({bootMessage: ''});

        const result = await request(sapi.app)
          .get(testUrl('/injectRoutableTest'))
          .expect(OK);

        expect(result.body.result).toBe('mock');

        done();
      } catch (err) {
        done.fail(err);
      }
    });
  });
});

/* tslint:enable:no-shadowed-variable */
