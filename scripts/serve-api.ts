import { startServer } from '../electron/server';

startServer({ port: Number(process.env.PORT || 3001) }).then((port) => {
  console.log(`GarageFlows API locale : http://0.0.0.0:${port}`);
});
