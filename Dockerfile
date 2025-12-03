# --- Stage 1: Build the Application ---
# We use a full JDK image with Maven to build the code.
# This image is larger but contains all the tools we need to compile.
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /app

# Copy the project files into the container
COPY . .

# Build the artifact (skip tests to speed up the build for now)
RUN mvn clean package -DskipTests

# --- Stage 2: Run the Application ---
# We use a lightweight JRE image for the final container.
# This drastically reduces the image size and improves security.
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Copy only the built JAR file from the 'builder' stage
# We use a wildcard (*.jar) to handle version name changes automatically
COPY --from=builder /app/target/*.jar app.jar

# Expose the port your app runs on (default Spring Boot port is 8080)
EXPOSE 8080

# Command to run the application
ENTRYPOINT ["java", "-jar", "app.jar"]