import { Router } from 'express';
import authRoutes from './auth';
import { authenticate, requireVerified } from '../lib/middleware';
import { storage } from '../storage';

const router = Router();

// Auth routes - no authentication required
router.use('/auth', authRoutes);

// Protected routes - require authentication
router.use('/characters', authenticate, async (req, res, next) => {
  // Forward to the appropriate handler based on the HTTP method
  const { method } = req;
  
  try {
    // GET /api/characters - Get all characters for the current user
    if (method === 'GET' && req.path === '/') {
      if (!req.userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      const characters = await storage.getAllCharacters(req.userId);
      return res.json(characters);
    }
    
    // GET /api/characters/:id - Get a character by ID
    if (method === 'GET' && req.path !== '/') {
      const id = req.path.substring(1); // Remove leading slash
      const character = await storage.getCharacterById(id);
      
      // Check if character exists and belongs to the user
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      
      // Check if character belongs to the user
      const userCharacters = await storage.getAllCharacters(req.userId);
      const isUsersCharacter = userCharacters.some(c => c.id === id);
      
      if (!isUsersCharacter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      return res.json(character);
    }
    
    // POST /api/characters - Create a new character
    if (method === 'POST') {
      // Validate required fields
      const { name, gender } = req.body;
      if (!name || !gender) {
        return res.status(400).json({ error: 'Name and gender are required' });
      }
      
      if (!req.userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      // Create character
      const character = await storage.createCharacter(req.body, req.userId);
      return res.status(201).json(character);
    }
    
    // PUT /api/characters/:id - Update a character
    if (method === 'PUT' && req.path !== '/') {
      const id = req.path.substring(1); // Remove leading slash
      
      // Check if character exists and belongs to the user
      const character = await storage.getCharacterById(id);
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      
      // Check if character belongs to the user
      const userCharacters = await storage.getAllCharacters(req.userId);
      const isUsersCharacter = userCharacters.some(c => c.id === id);
      
      if (!isUsersCharacter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Update character
      const updatedCharacter = await storage.updateCharacter(id, req.body);
      if (!updatedCharacter) {
        return res.status(404).json({ error: 'Character not found or failed to update' });
      }
      return res.json(updatedCharacter);
    }
    
    // DELETE /api/characters/:id - Delete a character
    if (method === 'DELETE' && req.path !== '/') {
      const id = req.path.substring(1); // Remove leading slash
      
      // Check if character exists and belongs to the user
      const character = await storage.getCharacterById(id);
      if (!character) {
        return res.status(404).json({ error: 'Character not found' });
      }
      
      // Check if character belongs to the user
      const userCharacters = await storage.getAllCharacters(req.userId);
      const isUsersCharacter = userCharacters.some(c => c.id === id);
      
      if (!isUsersCharacter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Delete character
      const success = await storage.deleteCharacter(id);
      if (!success) {
        return res.status(404).json({ error: 'Character not found or failed to delete' });
      }
      return res.json({ success: true });
    }
    
    // If we get here, the route is not handled
    next();
  } catch (error) {
    console.error('Error handling character request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stories routes - require authentication
router.use('/stories', authenticate, async (req, res, next) => {
  // Forward to the appropriate handler based on the HTTP method
  const { method } = req;
  
  try {
    // GET /api/stories - Get all stories for the current user
    if (method === 'GET' && req.path === '/') {
      if (!req.userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      const stories = await storage.getAllStories(req.userId);
      return res.json(stories);
    }
    
    // GET /api/stories/:id - Get a story by ID
    if (method === 'GET' && req.path !== '/') {
      if (!req.userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      const id = req.path.substring(1); // Remove leading slash
      const story = await storage.getStoryById(id, req.userId);
      
      if (!story) {
        return res.status(404).json({ error: 'Story not found' });
      }
      
      return res.json(story);
    }
    
    // POST /api/stories - Generate and save a new story
    if (method === 'POST') {
      // This is handled by the existing story generation route
      next();
      return;
    }
    
    // PUT /api/stories/:id/favorite - Toggle favorite status
    if (method === 'PUT' && req.path.endsWith('/favorite')) {
      if (!req.userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      const id = req.path.substring(1, req.path.indexOf('/favorite')); // Extract ID
      const { isFavorite } = req.body;
      
      if (typeof isFavorite !== 'boolean') {
        return res.status(400).json({ error: 'isFavorite must be a boolean' });
      }
      
      const updatedStory = await storage.toggleFavorite(id, isFavorite, req.userId);
      
      if (!updatedStory) {
        return res.status(404).json({ error: 'Story not found' });
      }
      
      return res.json(updatedStory);
    }
    
    // DELETE /api/stories/:id - Delete a story
    if (method === 'DELETE' && req.path !== '/') {
      if (!req.userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      const id = req.path.substring(1); // Remove leading slash
      
      const success = await storage.deleteStory(id, req.userId);
      
      if (!success) {
        return res.status(404).json({ error: 'Story not found' });
      }
      
      return res.json({ success: true });
    }
    
    // If we get here, the route is not handled
    next();
  } catch (error) {
    console.error('Error handling story request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User settings routes - require authentication
router.use('/settings', authenticate, async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  const { method } = req;
  
  try {
    // GET /api/settings/openai-key-status - Check if user has OpenAI API key
    if (method === 'GET' && req.path === '/openai-key-status') {
      const apiKey = await storage.getUserOpenAIKey(req.userId);
      return res.json({ hasKey: !!apiKey });
    }
    
    // POST /api/settings/openai-key - Set OpenAI API key
    if (method === 'POST' && req.path === '/openai-key') {
      const { key } = req.body;
      
      if (!key) {
        return res.status(400).json({ error: 'API key is required' });
      }
      await storage.setUserOpenAIKey(req.userId, key);
      return res.json({ success: true });
    }
    
    // DELETE /api/settings/openai-key - Delete OpenAI API key
    if (method === 'DELETE' && req.path === '/openai-key') {
      await storage.setUserOpenAIKey(req.userId, '');
      return res.json({ success: true });
    }
    
    // GET /api/settings/openai-model - Get user's OpenAI model preference
    if (method === 'GET' && req.path === '/openai-model') {
      const model = await storage.getUserOpenAIModel(req.userId);
      return res.json({ model });
    }
    
    // POST /api/settings/openai-model - Set OpenAI model preference
    if (method === 'POST' && req.path === '/openai-model') {
      const { model } = req.body;
      
      if (!model) {
        return res.status(400).json({ error: 'Model is required' });
      }
      
      await storage.setUserOpenAIModel(req.userId, model);
      return res.json({ success: true });
    }
    
    // GET /api/settings/stats/story-generation - Get story generation stats
    if (method === 'GET' && req.path === '/stats/story-generation') {
      const usedCount = await storage.getStoryGenerationCount(req.userId);
      const resetDate = await storage.getLastResetDate(req.userId);
      
      // Default: 50 free stories initially + 10/month
      const monthlyAllowance = 10;
      const initialAllowance = 50;
      
      // Calculate total allowance
      const total = resetDate ? monthlyAllowance : initialAllowance + monthlyAllowance;
      const remaining = Math.max(0, total - usedCount);
      
      return res.json({
        used: usedCount,
        remaining,
        total,
        lastReset: resetDate
      });
    }
    
    // If we get here, the route is not handled
    next();
  } catch (error) {
    console.error('Error handling settings request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export the router
export default router;