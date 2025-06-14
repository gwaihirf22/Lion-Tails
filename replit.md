# Lion Tails: Christian Bedtime Stories

## Overview

Lion Tails is a full-stack web application that generates personalized Christian bedtime stories for children. The application combines React frontend with Express backend, featuring AI-powered story generation, music database, and user authentication. Built on Node.js with TypeScript, it uses PostgreSQL for data persistence and includes comprehensive user management with session-based authentication.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: Custom component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js 20 with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Passport.js with local strategy and session management
- **API Design**: RESTful API endpoints with structured error handling

### Database Schema
- **Primary Database**: PostgreSQL (Neon serverless)
- **Fallback Storage**: In-memory storage for development/fallback scenarios
- **Tables**: Users, verification tokens, characters, stories, songs, heroes of faith
- **Session Storage**: PostgreSQL-backed session store with memory fallback

## Key Components

### Story Generation System
- **AI Integration**: OpenAI GPT-4o for story generation and image analysis
- **Template Engine**: Biblical event templates for story guidance
- **Character System**: User-created characters for personalized stories
- **Theme Integration**: Bible verses and moral lessons embedded in stories

### User Management
- **Authentication**: Username/password with email verification
- **Authorization**: Role-based access (user/admin)
- **Session Management**: Express-session with PostgreSQL store
- **Security**: Bcrypt password hashing, JWT tokens for API access

### Music Database
- **Song Management**: Christian songs with lyrics and guitar chords
- **Chord Diagrams**: Visual guitar chord representations
- **Search Functionality**: Full-text search across titles, artists, and lyrics
- **Audio Integration**: Placeholder for future audio generation features

### Heroes of Faith
- **Historical Figures**: Database of Christian historical figures
- **Story Integration**: Link heroes to generated stories
- **Educational Content**: Biographical information with sources

## Data Flow

1. **User Registration**: Email verification → Account activation → Profile setup
2. **Story Generation**: Character selection → Theme/event selection → AI generation → Story display/save
3. **Music Access**: Browse/search songs → View lyrics/chords → Play functionality (future)
4. **Content Management**: CRUD operations for characters, stories, and user preferences

## External Dependencies

### Core Dependencies
- **Database**: @neondatabase/serverless for PostgreSQL connectivity
- **AI Services**: OpenAI API for story generation and image analysis
- **Authentication**: Passport.js ecosystem for user management
- **UI Components**: Radix UI for accessible component primitives
- **Validation**: Zod for schema validation across frontend and backend

### Development Dependencies
- **Build Tools**: Vite for frontend bundling, esbuild for backend compilation
- **Type Safety**: TypeScript with strict configuration
- **Database Tools**: Drizzle Kit for schema migrations
- **Testing**: Built-in error handling and logging systems

## Deployment Strategy

### Replit Configuration
- **Runtime**: Node.js 20 with PostgreSQL 16 module
- **Build Process**: npm run build (Vite + esbuild)
- **Production Start**: npm run start
- **Development**: npm run dev with hot reload
- **Port Configuration**: Internal 5000 → External 80

### Environment Variables
- **DATABASE_URL**: PostgreSQL connection string (required for persistence)
- **OPENAI_API_KEY**: OpenAI API access (required for story generation)
- **SESSION_SECRET**: Session encryption key
- **EMAIL_CONFIG**: SMTP settings for email verification (optional)

### Fallback Mechanisms
- **Database Fallback**: Automatic switch to in-memory storage if PostgreSQL unavailable
- **Session Fallback**: Memory-based session store if PostgreSQL session store fails
- **Graceful Degradation**: Application remains functional without external services

## Changelog

```
Changelog:
- June 13, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```