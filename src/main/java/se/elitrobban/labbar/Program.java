package se.elitrobban.labbar;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * En av labbarna, som den byggts fran GitHub i Dockerfile. Layouten under {@code LABBAR_DIR}:
 *
 * <pre>
 *   bibliotek/classes/      kompilerade klasser (mvn package i labbens eget repo)
 *   bibliotek/lib/*.jar     labbens runtime-beroenden (jspecify for budget, inget for bibliotek)
 *   bibliotek/start/        filer som kopieras till varje korningens arbetskatalog
 *   bibliotek/commit.txt    vilken commit som byggdes
 * </pre>
 *
 * @author Robert Andersson Kopler
 */
record Program(String namn, String titel, String mainClass, String repo, Path rot) {

    static Program bibliotek(Path labbar) {
        return new Program("bibliotek", "Bibliotekshanteraren", "org.example.CliApp",
                "https://github.com/elitrobban89/Laboration-1-Bibliotekshanteraren", labbar.resolve("bibliotek"));
    }

    static Program budget(Path labbar) {
        return new Program("budget", "Budgethanteraren", "CliApp",
                "https://github.com/elitrobban89/Laboration-2-Budgethanteraren", labbar.resolve("budget"));
    }

    String commit() {
        try {
            return Files.readString(rot.resolve("commit.txt")).strip();
        } catch (IOException e) {
            return "okand";
        }
    }

    String classpath() throws IOException {
        List<String> delar = new ArrayList<>();
        delar.add(rot.resolve("classes").toString());
        Path lib = rot.resolve("lib");
        if (Files.isDirectory(lib)) {
            try (Stream<Path> jars = Files.list(lib)) {
                jars.filter(p -> p.toString().endsWith(".jar")).sorted().forEach(p -> delar.add(p.toString()));
            }
        }
        return String.join(java.io.File.pathSeparator, delar);
    }

    /** Kopierar startfilerna (t.ex. budgetens transaktioner.csv ur repot) till arbetskatalogen. */
    void forbered(Path arbetskatalog) throws IOException {
        Path start = rot.resolve("start");
        if (!Files.isDirectory(start)) return;
        try (Stream<Path> filer = Files.list(start)) {
            for (Path f : filer.toList()) {
                Files.copy(f, arbetskatalog.resolve(f.getFileName()));
            }
        }
    }
}
