Create a .env file, or modify your deployment envoriment to include the following:

```js
const DATABASE_CREDENTIALS = {
  "host": env.DB_HOST,
  "user": env.DB_USER,
  "password": env.DB_PASSWORD,
  "database": env.DB_DATABASE
};
```