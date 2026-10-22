import { startServer } from '../electron/server';

startServer({ port: Number(process.env.PORT || 3001) }).then((port) => {
  console.log(`GarageFlows API locale : http://${process.env.HOST || '127.0.0.1'}:${port} (boucle locale uniquement)`);
});
