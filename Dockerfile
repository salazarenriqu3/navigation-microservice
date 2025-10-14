FROM openjdk:17-jdk-slim

WORKDIR /app

# Copy Maven wrapper files first
COPY mvnw ./
COPY .mvn .mvn
COPY pom.xml ./

# Make mvnw executable
RUN chmod +x ./mvnw

# Copy source code
COPY src ./src

# Build the application
RUN ./mvnw clean package -DskipTests

EXPOSE 8080

CMD ["java", "-jar", "target/mapappprospring-0.0.1-SNAPSHOT.jar"]
