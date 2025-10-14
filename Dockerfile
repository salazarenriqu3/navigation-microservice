FROM openjdk:17-jdk-slim

WORKDIR /app

COPY . .

RUN mvn clean package -DskipTests

EXPOSE 8080

CMD ["java", "-jar", "target/mapappprospring-0.0.1-SNAPSHOT.jar"]
