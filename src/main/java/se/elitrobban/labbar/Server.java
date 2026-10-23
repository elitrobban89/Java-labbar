package se.elitrobban.labbar;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.logging.Logger;

/**
 * Webbtjansten som kor Laboration 1 (Bibliotekshanteraren) och Laboration 2 (Budgethanteraren)
 * i webblasaren. Varje besokare far en egen JVM-process med labbens CliApp - samma klasser som
 * i GitHub-repona, byggda fran dem i Dockerfile - och terminalen pa sidan skickar raderna till
 * processens stdin och visar dess stdout/stderr.
 *
 * <p>Ingen Spring: com.sun.net.httpserver racker for fem endpoints och startar pa en brakdel av
 * tiden, vilket ar det som spelar roll pa Renders gratis-CPU (se BiltUthyrnings och Bankomats
 * port-scan-timeouts).
 *
 * <pre>
 *   GET  /                         terminalsidan (+ /splash.js)
 *   GET  /api/info                 vilka commits som kor
 *   POST /api/start?program=X      startar bibliotek eller budget, svarar {id}
 *   GET  /api/k/{id}/ut?fran=N     utskrift efter bit N, vantar upp till 20 s (long-poll)
 *   POST /api/k/{id}/in            en rad till stdin (kroppen ar raden)
 *   POST /api/k/{id}/stopp         dodar processen
 * </pre>
 *
 * @author Robert Andersson Kopler
 */
public final class Server {

    private static final Logger log = Logger.getLogger(Server.class.getName());

    /** Varje korning ar en egen JVM (~40 MB). Fyra ryms med god marginal i gratisplanens 512 MB. */
    private static final int MAX_KORNINGAR = Integer.getInteger("labbar.max", 4);
    /** Klienten fragar hela tiden; tystnad sa har lange = fliken ar stangd. */
    private static final long TYST_MS = 2 * 60_000;
    private static final long MAX_LIVSTID_MS = 30 * 60_000;
    private static final int MAX_RAD = 1000;

    private static final String RAMAR = "frame-ancestors 'self' https://elitrobban.se https://www.elitrobban.se";

    private final Map<String, Program> program;
    private final Map<String, Korning> korningar = new ConcurrentHashMap<>();
    private final String java = ProcessHandle.current().info().command().orElse("java");

    private Server(Path labbar) {
        this.program = Map.of("bibliotek", Program.bibliotek(labbar), "budget", Program.budget(labbar));
    }

    public static void main(String[] args) throws IOException {
        Authorship.verifieraUpphov();
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        Path labbar = Path.of(System.getenv().getOrDefault("LABBAR_DIR", "/app/labbar"));
        new Server(labbar).starta(port);
    }

    private void starta(int port) throws IOException {
        HttpServer http = HttpServer.create(new InetSocketAddress(port), 0);
        http.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        http.createContext("/", this::hantera);
        http.start();

        Thread.ofVirtual().start(this::stada);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> korningar.values().forEach(Korning::stang)));
        program.values().forEach(p -> log.info(p.titel() + " byggd fran commit " + p.commit()));
        log.info("Java-labbar lyssnar pa port " + port);
    }

    private void hantera(HttpExchange ex) throws IOException {
        try (ex) {
            ex.getResponseHeaders().set("X-Author", Authorship.AUTHOR);
            ex.getResponseHeaders().set("Content-Security-Policy", RAMAR);
            String vag = ex.getRequestURI().getPath();
            String metod = ex.getRequestMethod();

            if (vag.equals("/") || vag.equals("/index.html")) {
                fil(ex, "index.html", "text/html; charset=utf-8");
            } else if (vag.equals("/splash.js")) {
                fil(ex, "splash.js", "text/javascript; charset=utf-8");
            } else if (vag.equals("/api/health")) {
                json(ex, 200, "{\"ok\":true}");
            } else if (vag.equals("/api/info") && metod.equals("GET")) {
                info(ex);
            } else if (vag.equals("/api/start") && metod.equals("POST")) {
                start(ex);
            } else if (vag.startsWith("/api/k/")) {
                String[] d = vag.substring("/api/k/".length()).split("/");
                Korning k = d.length == 2 ? korningar.get(d[0]) : null;
                if (k == null) {
                    json(ex, 404, "{\"fel\":\"Korningen finns inte langre. Starta om programmet.\"}");
                } else if (d[1].equals("ut") && metod.equals("GET")) {
                    ut(ex, k);
                } else if (d[1].equals("in") && metod.equals("POST")) {
                    in(ex, k);
                } else if (d[1].equals("stopp") && metod.equals("POST")) {
                    korningar.remove(k.id);
                    k.stang();
                    json(ex, 200, "{\"ok\":true}");
                } else {
                    json(ex, 404, "{\"fel\":\"Okand vag\"}");
                }
            } else {
                json(ex, 404, "{\"fel\":\"Okand vag\"}");
            }
        } catch (Exception e) {
            log.warning("Fel i " + ex.getRequestURI() + ": " + e);
            try {
                json(ex, 500, "{\"fel\":\"Internt fel\"}");
            } catch (IOException ignorerad) {
                // Svaret var redan paborjat
            }
        }
    }

    private void fil(HttpExchange ex, String namn, String typ) throws IOException {
        try (InputStream in = Server.class.getResourceAsStream("/public/" + namn)) {
            byte[] html = in.readAllBytes();
            ex.getResponseHeaders().set("Content-Type", typ);
            ex.getResponseHeaders().set("Cache-Control", "no-cache");
            ex.sendResponseHeaders(200, html.length);
            ex.getResponseBody().write(html);
        }
    }

    private void info(HttpExchange ex) throws IOException {
        List<String> delar = new ArrayList<>();
        for (String namn : List.of("bibliotek", "budget")) {
            Program p = program.get(namn);
            Program.Exempel e = p.exempel();
            delar.add(str(namn) + ":{\"titel\":" + str(p.titel()) + ",\"repo\":" + str(p.repo())
                    + ",\"commit\":" + str(p.commit())
                    + (e == null ? "" : ",\"rader\":" + e.rader() + ",\"saldo\":" + e.saldo()) + "}");
        }
        // Render satter RENDER_GIT_COMMIT till det har repots commit; lokalt finns ingen deploy att visa
        String deploy = System.getenv().getOrDefault("RENDER_GIT_COMMIT", "");
        if (deploy.length() > 7) deploy = deploy.substring(0, 7);
        json(ex, 200, "{" + String.join(",", delar) + ",\"java\":" + str(Runtime.version().toString())
                + (deploy.isEmpty() ? "" : ",\"deploy\":" + str(deploy)) + "}");
    }

    private void start(HttpExchange ex) throws IOException {
        Program p = program.get(param(ex.getRequestURI(), "program"));
        if (p == null) {
            json(ex, 400, "{\"fel\":\"Okant program\"}");
            return;
        }
        if (korningar.size() >= MAX_KORNINGAR) {
            json(ex, 503, "{\"fel\":\"Alla platser ar upptagna just nu. Forsok igen om en stund.\"}");
            return;
        }
        Path katalog = Files.createTempDirectory("labb-" + p.namn() + "-");
        p.forbered(katalog);
        // Sma JVM:er: labbarna ar sma program, och fyra av dem ska rymmas bredvid servern
        ProcessBuilder pb = new ProcessBuilder(java,
                "-Xmx32m", "-Xss512k", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1",
                "-XX:ReservedCodeCacheSize=16m", "-XX:MaxMetaspaceSize=48m",
                "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-Dstdin.encoding=UTF-8",
                "-Dfile.encoding=UTF-8", "-Duser.language=sv", "-Duser.country=SE",
                // Containern gar pa UTC: utan detta far loggen fel klockslag och LocalDate.now()
                // fel dag mellan midnatt och 01/02 svensk tid
                "-Duser.timezone=Europe/Stockholm",
                "-cp", p.classpath(), p.mainClass());
        pb.directory(katalog.toFile());
        String id = UUID.randomUUID().toString();
        Korning k = new Korning(id, p, katalog, pb.start());
        korningar.put(id, k);
        log.info("Startade " + p.namn() + " (" + korningar.size() + " igang)");
        json(ex, 200, "{\"id\":" + str(id) + "}");
    }

    private void ut(HttpExchange ex, Korning k) throws IOException, InterruptedException {
        int fran;
        try {
            fran = Integer.parseInt(param(ex.getRequestURI(), "fran"));
        } catch (NumberFormatException e) {
            fran = 0;
        }
        Korning.Utdrag u = k.vanta(fran, 20_000);
        StringBuilder sb = new StringBuilder("{\"bitar\":[");
        for (int i = 0; i < u.bitar().size(); i++) {
            Korning.Bit b = u.bitar().get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"t\":").append(str(b.text())).append(",\"e\":").append(b.err()).append('}');
        }
        sb.append("],\"nasta\":").append(u.nasta()).append(",\"klar\":").append(u.klar());
        if (u.kod() != null) sb.append(",\"kod\":").append(u.kod());
        json(ex, 200, sb.append('}').toString());
        if (u.klar()) {
            // Allt ar last och skickat - processen ar slut, sa korningen kan slappas
            korningar.remove(k.id);
            k.stang();
        }
    }

    private void in(HttpExchange ex, Korning k) throws IOException {
        String rad = new String(ex.getRequestBody().readNBytes(MAX_RAD * 4), StandardCharsets.UTF_8);
        rad = rad.replace("\r", "").replace("\n", " ");
        if (rad.length() > MAX_RAD) rad = rad.substring(0, MAX_RAD);
        if (!k.lever()) {
            json(ex, 409, "{\"fel\":\"Programmet har avslutats\"}");
            return;
        }
        k.skriv(rad);
        json(ex, 200, "{\"ok\":true}");
    }

    /** Dodar korningar vars flik stangts, och sadana som gatt for lange. */
    private void stada() {
        while (true) {
            try {
                Thread.sleep(15_000);
            } catch (InterruptedException e) {
                return;
            }
            long nu = System.currentTimeMillis();
            korningar.values().removeIf(k -> {
                boolean bort = nu - k.senastAktiv > TYST_MS || nu - k.startad > MAX_LIVSTID_MS;
                if (bort) {
                    k.stang();
                    log.info("Stadade bort en " + k.program.namn() + "-korning");
                }
                return bort;
            });
        }
    }

    private static String param(URI uri, String namn) {
        String q = uri.getRawQuery();
        if (q == null) return "";
        for (String par : q.split("&")) {
            int i = par.indexOf('=');
            if (i > 0 && par.substring(0, i).equals(namn)) return par.substring(i + 1);
        }
        return "";
    }

    private static void json(HttpExchange ex, int status, String kropp) throws IOException {
        byte[] b = kropp.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, b.length);
        try (OutputStream ut = ex.getResponseBody()) {
            ut.write(b);
        }
    }

    /** JSON-strang med citattecken. */
    static String str(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }
}
