import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  BadRequestException, HttpException, HttpStatus, NotFoundException, UnauthorizedException,
} from '@nestjs/common';

type MockRes = { status: jest.Mock; json: jest.Mock };
type MockHost = { switchToHttp: () => { getResponse: () => MockRes; getRequest: () => { method: string; url: string } } };

function makeHost(): { host: MockHost; res: MockRes } {
  const res: MockRes = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const host: MockHost = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: 'POST', url: '/api/test' }),
    }),
  };
  return { host, res };
}

/** Pull the logged output so expected 5xx noise doesn't clutter the test run. */
function silenceLogger() {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  return () => spy.mockRestore();
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  afterEach(() => jest.restoreAllMocks());

  it('maps a BadRequestException to 400 with its message', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException('amount must be positive'), host as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: 'amount must be positive',
      path: '/api/test',
    }));
  });

  it('maps NotFound to 404 and Unauthorized to 401', () => {
    const a = makeHost();
    filter.catch(new NotFoundException('Invoice not found'), a.host as never);
    expect(a.res.status).toHaveBeenCalledWith(404);

    const b = makeHost();
    filter.catch(new UnauthorizedException('Invalid credentials'), b.host as never);
    expect(b.res.status).toHaveBeenCalledWith(401);
  });

  it('joins class-validator array messages into one readable string', () => {
    const { host, res } = makeHost();
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'password should not be empty'],
        error: 'Bad Request',
      }),
      host as never,
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'email must be an email; password should not be empty',
    }));
  });

  it('never leaks internals for an unexpected error', () => {
    const restore = silenceLogger();
    const { host, res } = makeHost();
    // Simulates a Prisma driver error carrying SQL text.
    filter.catch(new Error('SQLITE_CONSTRAINT: unique failed: students.admission_no'), host as never);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('SQLITE_CONSTRAINT');
    expect(JSON.stringify(body)).not.toContain('admission_no');
    restore();
  });

  it('handles a thrown non-Error without crashing', () => {
    const restore = silenceLogger();
    const { host, res } = makeHost();
    filter.catch('a raw string', host as never);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    restore();
  });

  it('always includes a timestamp and the request path', () => {
    const { host, res } = makeHost();
    filter.catch(new HttpException('nope', 418), host as never);

    const body = res.json.mock.calls[0][0];
    expect(body.path).toBe('/api/test');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});