# Java-labbar: webbtjansten + de tva labbarna, BYGGDA FRAN GITHUB vid varje deploy.
# Labbarnas kod finns inte i det har repot. Bygget klonar repona och kor deras egna pom.xml,
# sa det som kors pa sidan ar exakt det som ligger pa GitHub.
FROM eclipse-temurin:27-jdk AS build
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pom.xml .
COPY .mvn ./.mvn
COPY mvnw .
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src ./src
RUN ./mvnw -B -q clean package

# ADD av senaste commit-referensen bryter Dockers lagercache nar en labb far en ny commit,
# annars kunde Render ateranvanda en gammal klon. En Manual Deploy pa Render racker alltsa
# for att plocka upp en push till labb-repona. Commit-flodet (Atom), inte api.github.com: API:t
# tillater 60 oinloggade anrop i timmen per IP, och Renders byggmaskiner delar IP.
ADD https://github.com/elitrobban89/Laboration-1-Bibliotekshanteraren/commits/master.atom /tmp/labb1-head.atom
ADD https://github.com/elitrobban89/Laboration-2-Budgethanteraren/commits/main.atom /tmp/labb2-head.atom
RUN git clone --depth 1 https://github.com/elitrobban89/Laboration-1-Bibliotekshanteraren.git /labb/bibliotek \
 && git clone --depth 1 https://github.com/elitrobban89/Laboration-2-Budgethanteraren.git /labb/budget

# Labbarnas egna byggen. Budgethanterarens JUnit-tester kors: faller de, faller deployen
# och Render fortsatter servera den forra, grona versionen.
RUN ./mvnw -B -q -f /labb/bibliotek/pom.xml package \
 && ./mvnw -B -q -f /labb/budget/pom.xml package dependency:copy-dependencies \
      -DincludeScope=runtime -DoutputDirectory=/labb/budget/target/lib

# Layouten som Program.java laser: <namn>/classes, lib, start, commit.txt.
# transaktioner.csv ar gitignorerad i labb 2-repot, sa exempelfilen kommer harifran.
COPY exempeldata ./exempeldata
RUN mkdir -p /ut/bibliotek /ut/budget/start \
 && cp -r /labb/bibliotek/target/classes /ut/bibliotek/classes \
 && cp -r /labb/budget/target/classes /ut/budget/classes \
 && cp -r /labb/budget/target/lib /ut/budget/lib \
 && cp exempeldata/budget/transaktioner.csv /ut/budget/start/ \
 && git -C /labb/bibliotek rev-parse --short HEAD > /ut/bibliotek/commit.txt \
 && git -C /labb/budget rev-parse --short HEAD > /ut/budget/commit.txt

FROM eclipse-temurin:27-jre-alpine
# CDS-arkivet + bara C1: samma startfix som BiltUthyrning och Bankomat. Har gor den dubbel nytta,
# eftersom varje labbkorning ar en egen JVM som ocksa startar fran arkivet.
RUN java -Xshare:dump
WORKDIR /app
COPY --from=build /app/target/java-labbar.jar app.jar
COPY --from=build /ut /app/labbar
ENV LABBAR_DIR=/app/labbar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:TieredStopAtLevel=1", "-Xmx64m", "-XX:+UseSerialGC", "-jar", "app.jar"]
