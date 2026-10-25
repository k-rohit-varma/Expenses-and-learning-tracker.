import 'dotenv/config';
export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI,
  authSecret: process.env.AUTH_SECRET,
  username: process.env.INITIAL_ADMIN_USERNAME,
  password: process.env.INITIAL_ADMIN_PASSWORD,
  production: process.env.NODE_ENV === 'production',
  frontendOrigin: process.env.FRONTEND_ORIGIN || (process.env.NODE_ENV === 'production'
    ? 'https://expenses-and-learning-tracker-frontend.onrender.com'
    : 'http://localhost:5173'),
};
