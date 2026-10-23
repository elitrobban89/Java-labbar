package se.elitrobban.labbar;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * En pagaende korning av en labb: en egen JVM-process med labbens oforandrade CliApp, stdin
 * och stdout kopplade till webbterminalen. Utskriften sparas som en lista av bitar sa att
 * klienten kan fraga "ge mig allt efter bit N" och vanta tills nagot nytt kommer.
 *
 * <p>stderr halls isar fran stdout: dit skriver Budgethanterarens ConsoleHandler sina WARNING-
 * och SEVERE-rader, och terminalen visar dem roda precis som IntelliJ gor.
 *
 * @author Robert Andersson Kopler
 */
final class Korning {

    /** En bit utskrift. err = kom fran stderr. */
    record Bit(String text, boolean err) {
    }

    /** Mer an sa har manga tecken sparas inte - en loop i ett labbprogram ska inte fylla minnet. */
    private static final int MAX_TECKEN = 400_000;

    final String id;
    final Program program;
    private final Process process;
    private final Path katalog;
    private final Writer stdin;
    private final List<Bit> bitar = new ArrayList<>();
    private int tecken;
    private int lasareKvar = 2;
    final long startad = System.currentTimeMillis();
    volatile long senastAktiv = startad;

    Korning(String id, Program program, Path katalog, Process process) {
        this.id = id;
        this.program = program;
        this.katalog = katalog;
        this.process = process;
        this.stdin = process.outputWriter(StandardCharsets.UTF_8);
        Thread.ofVirtual().start(() -> las(process.getInputStream(), false));
        Thread.ofVirtual().start(() -> las(process.getErrorStream(), true));
        // Vacker vanta() aven om lasarna redan ar klara nar processen gar ner
        process.onExit().thenRun(() -> {
            synchronized (this) {
                notifyAll();
            }
        });
    }

    private void las(InputStream strom, boolean err) {
        try (Reader r = new InputStreamReader(strom, StandardCharsets.UTF_8)) {
            char[] buf = new char[4096];
            int n;
            while ((n = r.read(buf)) != -1) {
                lagg(new String(buf, 0, n), err);
            }
        } catch (IOException e) {
            // Processen dodades - strommen stangs, inget att gora
        } finally {
            synchronized (this) {
                lasareKvar--;
                notifyAll();
            }
        }
    }

    private synchronized void lagg(String text, boolean err) {
        if (tecken >= MAX_TECKEN) return;
        tecken += text.length();
        bitar.add(new Bit(text, err));
        notifyAll();
    }

    /** Skickar en rad till programmets stdin, som om den skrivits i terminalen och fatt Enter. */
    void skriv(String rad) throws IOException {
        senastAktiv = System.currentTimeMillis();
        stdin.write(rad + "\n");
        stdin.flush();
    }

    /** Svaret pa en avlasning: nya bitar, nasta index, och om programmet ar slut. */
    record Utdrag(List<Bit> bitar, int nasta, boolean klar, Integer kod) {
    }

    /**
     * Vantar upp till {@code maxMs} pa bitar efter index {@code fran}. Returnerar direkt om det
     * redan finns nagot nytt, eller om programmet ar slut.
     */
    synchronized Utdrag vanta(int fran, long maxMs) throws InterruptedException {
        senastAktiv = System.currentTimeMillis();
        long grans = System.currentTimeMillis() + maxMs;
        while (bitar.size() <= fran && !klar()) {
            long kvar = grans - System.currentTimeMillis();
            if (kvar <= 0) break;
            wait(kvar);
        }
        int start = Math.min(Math.max(fran, 0), bitar.size());
        boolean klar = klar();
        return new Utdrag(List.copyOf(bitar.subList(start, bitar.size())), bitar.size(), klar,
                klar ? process.exitValue() : null);
    }

    /** Klar = processen har avslutats OCH all utskrift ar last. */
    private boolean klar() {
        return lasareKvar == 0 && !process.isAlive();
    }

    boolean lever() {
        return process.isAlive();
    }

    /** Dodar processen (och eventuella barn) och raderar arbetskatalogen. */
    void stang() {
        process.descendants().forEach(ProcessHandle::destroyForcibly);
        process.destroyForcibly();
        try {
            process.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        try (Stream<Path> filer = Files.walk(katalog)) {
            filer.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException e) {
            // Temp-katalogen stads bort vid nasta omstart av containern
        }
    }
}
