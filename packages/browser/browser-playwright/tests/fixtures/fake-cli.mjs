// Fixture stand-in for playwright-cli, driven by FAKE_CLI_MODE:
//   echo      -> print argv on stdout, exit 0
//   fail      -> print one line on stderr, exit 2
//   slow      -> sleep 30s, exit 0
//   big       -> print 200KB of "x", exit 0
//   not-open  -> print "Browser 'x' is not open.", exit 1
//   silent    -> stay alive doing nothing (readiness-probe failure case)
//   dashboard -> serve 200 on the --port value until killed
//   redirect  -> serve the real dashboard's 302 root and stop when its parent stdin closes
//   hang      -> accept TCP but never answer (probe-timeout case)
//   stubborn  -> serve 200 and ignore SIGTERM (SIGKILL escalation case)
//   suicide   -> kill self with SIGKILL before serving
//   help      -> print a fixed help text, exit 0
import http from 'node:http'

const args = process.argv.slice(2)
const mode = process.env.FAKE_CLI_MODE ?? 'echo'

if (args.some(arg => arg.startsWith('--workspaceDir='))) {
  console.error('Unknown option: --workspaceDir')
  process.exit(1)
}

const portOf = () => {
  const portArg = args.find(arg => arg.startsWith('--port='))
  return Number(portArg?.slice('--port='.length))
}

switch (mode) {
  case 'echo':
    console.log(`fake-cli: ${args.join(' ')}`)
    break
  case 'fail':
    console.error('fake-cli failure line')
    process.exit(2)
    break
  case 'slow':
    setTimeout(() => {}, 30_000)
    break
  case 'big':
    console.log('x'.repeat(200_000))
    break
  case 'not-open':
    console.error("Browser 'fake' is not open.")
    process.exit(1)
    break
  case 'silent':
    setTimeout(() => {}, 30_000)
    break
  case 'dashboard': {
    const port = portOf()
    if (!Number.isInteger(port) || port <= 0) process.exit(3)
    const server = http.createServer((_req, res) => { res.writeHead(200); res.end('dashboard-fixture') })
    server.listen(port, '127.0.0.1')
    break
  }
  case 'redirect': {
    const port = portOf()
    if (!Number.isInteger(port) || port <= 0) process.exit(3)
    process.stdin.on('close', () => process.exit(0))
    const server = http.createServer((_req, res) => {
      res.writeHead(302, { location: '/index.html?ws=fixture-token' })
      res.end()
    })
    server.listen(port, '127.0.0.1')
    break
  }
  case 'hang': {
    const port = portOf()
    if (!Number.isInteger(port) || port <= 0) process.exit(3)
    // Accepts connections but never writes a response.
    http.createServer(() => {}).listen(port, '127.0.0.1')
    break
  }
  case 'stubborn': {
    const port = portOf()
    if (!Number.isInteger(port) || port <= 0) process.exit(3)
    process.on('SIGTERM', () => {})
    const server = http.createServer((_req, res) => { res.writeHead(200); res.end('dashboard-fixture') })
    server.listen(port, '127.0.0.1')
    break
  }
  case 'suicide':
    process.kill(process.pid, 'SIGKILL')
    break
  case 'help':
    console.log('fake-cli help: open goto click type snapshot screenshot')
    break
  case 'pwd':
    console.log(process.cwd())
    break
  default:
    console.log('fake-cli: unknown mode')
}
