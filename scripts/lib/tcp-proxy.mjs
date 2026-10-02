// Forwards 127.0.0.1:<port> inside a Docker container to the same port on the
// host, so Playwright in the container keeps the host's baseURL and cookies.
import net from 'node:net'

const port = Number(process.argv[2])
net
  .createServer((client) => {
    const upstream = net.connect(port, 'host.docker.internal')
    client.pipe(upstream).pipe(client)
    const close = () => {
      client.destroy()
      upstream.destroy()
    }
    client.on('error', close)
    upstream.on('error', close)
  })
  .listen(port, '127.0.0.1')
