import { redisOptionsFromUrl } from './redis.module';

describe('redisOptionsFromUrl', () => {
  it('parses host, port, db, credentials and TLS', () => {
    expect(redisOptionsFromUrl('redis://127.0.0.1:6380/1')).toMatchObject({ host: '127.0.0.1', port: 6380, db: 1 });
    expect(redisOptionsFromUrl('rediss://user:p%40ss@cache.example.com')).toMatchObject({
      host: 'cache.example.com',
      port: 6379,
      db: 0,
      username: 'user',
      password: 'p@ss',
      tls: {},
    });
  });
});
