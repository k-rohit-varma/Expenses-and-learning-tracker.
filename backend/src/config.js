import 'dotenv/config';
export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI,
  authSecret: process.env.AUTH_SECRET,
  username: process.env.INITIAL_ADMIN_USERNAME,
  password: process.env.INITIAL_ADMIN_PASSWORD,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  production: process.env.NODE_ENV === 'production',
};
