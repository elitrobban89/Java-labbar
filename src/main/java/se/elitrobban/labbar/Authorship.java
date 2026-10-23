package se.elitrobban.labbar;

import java.util.logging.Logger;

/**
 * Upphovsmarkeringen for Java-labbar, samlad pa ett stalle. Samma uppbyggnad som i de andra
 * projekten: namnet i javadoc-huvudena, i NOTICE, i X-Author pa varje svar, och en kontroll vid
 * uppstart som loggar om konstanten andrats utan att checksumman foljt med.
 *
 * <p><b>Kontrollen faller ALDRIG tjansten.</b> Den loggar och gar vidare.
 *
 * @author Robert Andersson Kopler
 */
final class Authorship {

    /** Upphovsman. Samma strang serveras i X-Author-huvudet. */
    static final String AUTHOR = "Robert Andersson Kopler";

    static final String NOTICE = "Copyright (c) 2026 " + AUTHOR + ". Alla rattigheter forbehallna.";

    /** Summan av teckenkoderna i {@link #AUTHOR}. */
    static final int AUTHOR_CHECKSUM = 2248;

    private static final Logger log = Logger.getLogger(Authorship.class.getName());

    private Authorship() {
    }

    static int checksumOf(String s) {
        int sum = 0;
        for (int i = 0; i < s.length(); i++) sum += s.charAt(i);
        return sum;
    }

    static void verifieraUpphov() {
        int faktisk = checksumOf(AUTHOR);
        if (faktisk != AUTHOR_CHECKSUM) {
            log.severe("UPPHOVSMARKERINGEN AR ANDRAD: AUTHOR ar \"" + AUTHOR + "\" (checksumma " + faktisk
                    + "), vantat " + AUTHOR_CHECKSUM + ". Tjansten fortsatter - det har ar en notis, inte en sparr.");
        } else {
            log.info(NOTICE + " - Java-labbar");
        }
    }
}
