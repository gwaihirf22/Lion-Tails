// Test script to check if the application can fallback to memory storage
// when no database connection is available.

// This test should work in a deployment environment where DATABASE_URL might not be set
// or might be incorrect.

// Run this with:
// npx tsx test-db-fallback.js

// Import the storage initialized in storage.ts 
import { storage } from './server/storage';

async function testDbFallback() {
  console.log('Testing database fallback mechanisms...');
  
  try {
    // Test 1: Check if storage instantiation works
    console.log('Test 1: Storage instantiation');
    console.log('Storage type:', storage.constructor.name);
    console.log('Session store type:', storage.sessionStore.constructor.name);
    
    // Test 2: Try to get a non-existent user
    console.log('\nTest 2: Get non-existent user');
    const user = await storage.getUser(9999);
    console.log('Result:', user === undefined ? 'undefined (expected)' : 'unexpected result');
    
    // Test 3: Get all characters
    console.log('\nTest 3: Get all characters');
    const characters = await storage.getAllCharacters();
    console.log('Characters count:', characters.length);
    
    // Test 4: Get all songs
    console.log('\nTest 4: Get all songs');
    const songs = await storage.getAllSongs();
    console.log('Songs count:', songs.length);
    
    // Test 5: Get all heroes
    console.log('\nTest 5: Get all heroes');
    const heroes = await storage.getAllHeroesOfFaith();
    console.log('Heroes count:', heroes.length);
    
    console.log('\nAll tests completed successfully. The application should be able to deploy without database errors.');
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testDbFallback();