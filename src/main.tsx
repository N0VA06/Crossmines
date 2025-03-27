// Interactive BombSweeper Game for Reddit Devvit
import {Devvit, useState, useEffect, useInterval} from '@devvit/public-api'

// Game states
type Page = 'home' | 'setup' | 'game' | 'win' | 'lose' | 'leaderboard';

// Updated Theme Constants with Enhanced Visual Design
const THEME = {
  // Base Colors
  background: '#0F0F0F',  // Slightly darker background for more depth
  cellUnrevealed: '#1A1A1A',  // More nuanced unrevealed cell color
  cellRevealed: '#262626',  // Slightly lighter revealed cell
  cellSafe: '#1C3D2E',  // Refined safe cell color
  cellBomb: '#8B0000',  // Deep red for bombs instead of pink
  accent: '#BB86FC',  // Kept the original accent
  accentSecondary: '#03DAC6',  // Kept the original secondary accent
  error: '#CF6679',  // Kept the original error color
  
  // Text Colors
  textPrimary: '#E0E0E0',  // Softer white for better readability
  textSecondary: 'rgba(224, 224, 224, 0.7)',  // Adjusted secondary text
  textDisabled: 'rgba(224, 224, 224, 0.38)',  // Adjusted disabled text
  
  // Interaction and Progress Colors
  progressBackground: 'rgba(255, 255, 255, 0.1)',  // More subtle progress background
  safeReveal: 'rgba(3, 218, 198, 0.2)',  // Slightly more transparent reveal
  
  // Additional Theme Enhancements
  border: 'rgba(255, 255, 255, 0.05)',  // Subtle border for depth
  shadow: 'rgba(0, 0, 0, 0.2)',  // Soft shadow for elevation
  
  // Number Cell Colors (with improved contrast)
  numberColors: {
    1: '#4A9FE3',    // Bright blue
    2: '#2ECC71',    // Vibrant green
    3: '#E74C3C',    // Strong red
    4: '#9B59B6',    // Deep purple
    5: '#F39C12',    // Warm orange
    6: '#1ABC9C',    // Teal
    7: '#D35400',    // Burnt orange
    8: '#7F8C8D',    // Muted gray
  }
};

// Optional: You can add additional theme-related utility functions if needed
const ThemeUtils = {
  getCellNumberColor: (number) => THEME.numberColors[number] || THEME.textPrimary,
  getContrastColor: (bgColor) => {
    // Simple contrast calculation logic could be added here
    return bgColor === THEME.cellBomb ? THEME.textPrimary : THEME.textPrimary;
  }
};

export { THEME, ThemeUtils };

// Game difficulty levels
const DIFFICULTY = {
  EASY: { name: 'Easy', bombPercentage: 0.1, depth: 2 },
  MEDIUM: { name: 'Medium', bombPercentage: 0.15, depth: 1 },
  HARD: { name: 'Hard', bombPercentage: 0.2, depth: 1 },
}

// Cell types
const CELL_TYPES = {
  EMPTY: 0,
  BOMB: 1,
  NUMBER: 2,
}

// Configure Devvit with Redis support
Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Custom button component
const ThemedButton = ({
  children,
  onPress, 
  primary = false,
  small = false,
  disabled = false
}: {
  children: Devvit.ElementChildren;
  onPress: () => void;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
}) => (
  <hstack 
    onPress={disabled ? undefined : onPress}
    backgroundColor={primary ? THEME.accent : 'transparent'}
    border={primary ? 'none' : 'thin'}
    borderColor={primary ? undefined : THEME.accent}
    padding={small ? "xsmall" : "small"}
    paddingLeft={small ? "small" : "medium"}
    paddingRight={small ? "small" : "medium"}
    cornerRadius="medium"
    opacity={disabled ? 0.5 : 1}
  >
    <text 
      weight="bold" 
      size={small ? "small" : "medium"}
      color={primary ? THEME.background : THEME.accent}
    >
      {children}
    </text>
  </hstack>
);

// Themed section container
const Section = ({
  children,
  title
}: {
  children: Devvit.ElementChildren;
  title?: string;
}) => (
  <vstack 
    backgroundColor="rgba(255, 255, 255, 0.05)"
    padding="medium"
    cornerRadius="medium"
    width="95%"
    gap="medium"
  >
    {title && <text size="medium" weight="bold" color={THEME.textPrimary}>{title}</text>}
    {children}
  </vstack>
);

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
// Main game component
Devvit.addCustomPostType({
  name: 'Crossmines',
  height: "tall",
  render: context => {
    // Game state management
    const [gameState, setGameState] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState<Page>('home');
    const [gridSize, setGridSize] = useState(10); // 10x10 grid by default
    const [grid, setGrid] = useState<Array<{ type: number, value: number, revealed: boolean, flagged: boolean, animating?: boolean }>>([]);
    const [revealedCount, setRevealedCount] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [moveCount, setMoveCount] = useState(0);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [gameStartTime, setGameStartTime] = useState(0);
    const [bombCount, setBombCount] = useState(0);
    const [flagCount, setFlagCount] = useState(0);
    const [flagMode, setFlagMode] = useState(false);
    const [difficulty, setDifficulty] = useState('MEDIUM');
    const [streakCount, setStreakCount] = useState(0);
    const [bestScore, setBestScore] = useState<Record<string, {time: number, revealed: number}>>({
      'EASY': {time: Infinity, revealed: 0},
      'MEDIUM': {time: Infinity, revealed: 0},
      'HARD': {time: Infinity, revealed: 0},
    });
    
      // Sync with Redis storage
      useInterval(async () => {   
        try {
          if (!context.postId) return;
          
          // First time load or when no state exists yet
          if (isLoading) {
            const storedState = await context.redis.get(`bombsweeper_${context.postId}`);
            if (storedState) {
              const parsedState = JSON.parse(storedState);
              // Update local state with stored state
              setGameState(parsedState);
              setCurrentPage(parsedState.currentPage || 'home');
              setGrid(parsedState.grid || []);
              setGridSize(parsedState.gridSize || 10);
              setDifficulty(parsedState.difficulty || 'MEDIUM');
              setBombCount(parsedState.bombCount || 0);
              setFlagCount(parsedState.flagCount || 0);
              setRevealedCount(parsedState.revealedCount || 0);
              setGameOver(parsedState.gameOver || false);
              setMoveCount(parsedState.moveCount || 0);
              setTimeElapsed(parsedState.timeElapsed || 0);
              setGameStartTime(parsedState.gameStartTime || 0);
              setBestScore(parsedState.bestScore || {
                'EASY': {time: Infinity, revealed: 0},
                'MEDIUM': {time: Infinity, revealed: 0},
                'HARD': {time: Infinity, revealed: 0},
              });
              setStreakCount(parsedState.streakCount || 0);
            } else {
              // Initialize new game state in Redis
              const initialState = {
                currentPage: 'home',
                gridSize: 10,
                grid: [],
                difficulty: 'MEDIUM',
                bombCount: 0,
                flagCount: 0,
                revealedCount: 0,
                gameOver: false,
                moveCount: 0,
                timeElapsed: 0,
                gameStartTime: 0,
                players: [],
                bestScore: {
                  'EASY': {time: Infinity, revealed: 0},
                  'MEDIUM': {time: Infinity, revealed: 0},
                  'HARD': {time: Infinity, revealed: 0},
                },
                streakCount: 0,
              };
              await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(initialState));
              setGameState(initialState);
            }
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Error syncing with Redis:", error);
        }
      }, 5000).start();

      // Update timer state every second
      useInterval(() => {
        if (currentPage === 'game' && !gameOver && gameStartTime > 0) {
          const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
          setTimeElapsed(elapsed);
          
          // Also update Redis state with new time
          if (gameState) {
            const updatedState = {
              ...gameState,
              timeElapsed: elapsed
            };
            context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedState));
          }
        }
      }, 1000).start();    
    const startGame = async () => {
      // Get difficulty settings
      const difficultySettings = DIFFICULTY[difficulty];
      const bombPercentage = difficultySettings.bombPercentage;
      
      const totalCells = gridSize * gridSize;
      const bombsToPlace = Math.floor(totalCells * bombPercentage);
      
      // Create empty grid
      const newGrid = Array(totalCells).fill(null).map(() => ({
        type: CELL_TYPES.EMPTY,
        value: 0,
        revealed: false,
        flagged: false,
        animating: false
      }));
      
      // Place bombs randomly
      let bombsPlaced = 0;
      while (bombsPlaced < bombsToPlace) {
        const randomIndex = Math.floor(Math.random() * totalCells);
        if (newGrid[randomIndex].type !== CELL_TYPES.BOMB) {
          newGrid[randomIndex].type = CELL_TYPES.BOMB;
          bombsPlaced++;
        }
      }
      
      // Calculate numbers for adjacent bombs
      for (let i = 0; i < totalCells; i++) {
        if (newGrid[i].type === CELL_TYPES.BOMB) continue;
        
        // Get row and column
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;
        
        // Check all 8 adjacent cells for bombs
        let adjacentBombs = 0;
        for (let r = -1; r <= 1; r++) {
          for (let c = -1; c <= 1; c++) {
            if (r === 0 && c === 0) continue;
            
            const newRow = row + r;
            const newCol = col + c;
            
            // Check if the adjacent cell is valid
            if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
              const adjacentIndex = newRow * gridSize + newCol;
              if (newGrid[adjacentIndex].type === CELL_TYPES.BOMB) {
                adjacentBombs++;
              }
            }
          }
        }
        
        if (adjacentBombs > 0) {
          newGrid[i].type = CELL_TYPES.NUMBER;
          newGrid[i].value = adjacentBombs;
        }
      }
      
      // Set the game start time to current time
      const startTime = Date.now();
      
      // Set all state in a batch
      setBombCount(bombsToPlace);
      setFlagCount(0);
      setGrid(newGrid);
      setRevealedCount(0);
      setGameOver(false);
      setMoveCount(0);
      setTimeElapsed(0);
      setFlagMode(false);
      setGameStartTime(startTime);
      setCurrentPage('game');
      
      // Create updated game state
      const updatedGameState = {
        ...gameState,
        currentPage: 'game', // Explicit page setting here
        gridSize,
        grid: newGrid,
        difficulty,
        bombCount: bombsToPlace,
        flagCount: 0,
        revealedCount: 0,
        gameOver: false,
        moveCount: 0,
        timeElapsed: 0,
        gameStartTime: startTime,
        players: gameState?.players || [],
        bestScore,
        streakCount,
      };
      
      // Update Redux-stored state immediately
      setGameState(updatedGameState);
      
      // Then persist to Redis
      try {
        await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
      } catch (error) {
        console.error("Error saving game state to Redis:", error);
      }
    };

    // Handle cell reveal
    const revealCell = async (index) => {
      if (gameOver || grid[index].revealed || grid[index].flagged) {
        return;
      }
      
      const newGrid = [...grid];
      
      // If in flag mode, toggle flag
      if (flagMode) {
        toggleFlag(index);
        return;
      }
      
      // If it's a bomb, game over
      if (newGrid[index].type === CELL_TYPES.BOMB) {
        // Reveal all bombs
        for (let i = 0; i < newGrid.length; i++) {
          if (newGrid[i].type === CELL_TYPES.BOMB) {
            newGrid[i].revealed = true;
          }
        }
        setGrid(newGrid);
        setGameOver(true);
        setCurrentPage('lose');
        
        // Update Redis state
        const updatedGameState = {
          ...gameState,
          currentPage: 'lose',
          grid: newGrid,
          gameOver: true,
        };
        await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
        setGameState(updatedGameState);
        return;
      }
      
      // Increase move count on the first move
      if (revealedCount === 0) {
        setMoveCount(moveCount + 1);
      }
      
      // Reveal the cell
      newGrid[index].revealed = true;
      
      // If it's an empty cell, gradually reveal adjacent cells
      if (newGrid[index].type === CELL_TYPES.EMPTY) {
        // Apply animation effect
        newGrid[index].animating = true;
        setGrid([...newGrid]);
        
        // Reveal empty cells more gradually with a depth based on difficulty
        setTimeout(() => {
          const gradualGrid = [...newGrid];
          gradualGrid[index].animating = false;
          
          // Use different reveal depths based on difficulty
          const revealDepth = DIFFICULTY[difficulty].depth;
          revealAdjacentCells(gradualGrid, index, revealDepth);
          setGrid(gradualGrid);
          
          // Count revealed cells after gradual reveal
          const revealed = gradualGrid.filter(cell => cell.revealed).length;
          setRevealedCount(revealed);
          
          // Check if the game is won after gradual reveal
          checkWinCondition(gradualGrid, revealed);
          
          // Update Redis state
          const updatedGameState = {
            ...gameState,
            grid: gradualGrid,
            revealedCount: revealed,
            moveCount: moveCount + 1,
          };
          context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
          setGameState(updatedGameState);
        }, 150); // Small delay for gradual effect
      }
      
      setGrid(newGrid);
      
      // Count revealed cells, but only if it's not an empty cell
      // (for empty cells, this happens in the setTimeout)
      if (newGrid[index].type !== CELL_TYPES.EMPTY) {
        const revealed = newGrid.filter(cell => cell.revealed).length;
        setRevealedCount(revealed);
        
        // Check win condition
        checkWinCondition(newGrid, revealed);
        
        // Update Redis state
        const updatedGameState = {
          ...gameState,
          grid: newGrid,
          revealedCount: revealed,
          moveCount: moveCount + 1,
        };
        await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
        setGameState(updatedGameState);
      }
    };
    const updatePlayerStats = async (userId, update) => {
      if (!userId || !gameState) return;
    
      try {
        // Find the player in the players array
        const playerIndex = gameState.players.findIndex(p => p.id === userId);
        if (playerIndex === -1) return; // Player not found
        
        // Create a new game state with updated player stats
        const updatedGameState = {
          ...gameState,
          players: [...gameState.players]
        };
        
        // Apply the updates to the player's stats
        updatedGameState.players[playerIndex] = {
          ...updatedGameState.players[playerIndex],
          ...update
        };
        
        // Update local state
        setGameState(updatedGameState);
        
        // Persist to Redis
        await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
        
        console.log(`Updated player ${updatedGameState.players[playerIndex].username}'s stats:`, update);
      } catch (error) {
        console.error("Error updating player stats:", error);
      }
    };    

    // Helper function to check win condition
    const checkWinCondition = async (grid, revealed) => {
      const totalSafeCells = grid.length - bombCount;
      if (revealed === totalSafeCells) {
        // Game won!
        setGameOver(true);
        setStreakCount(streakCount + 1);
        
        // Update best score if applicable
        const finalTime = Math.floor((Date.now() - gameStartTime) / 1000);
        const currentBest = bestScore[difficulty];
        
        let newBestScore = {...bestScore};
        let isNewBest = false;
        
        if (currentBest.time === Infinity || 
            finalTime < currentBest.time ||
            (finalTime === currentBest.time && revealed > currentBest.revealed)) {
          newBestScore[difficulty] = {time: finalTime, revealed};
          setBestScore(newBestScore);
          isNewBest = true;
        }
        
        setCurrentPage('win');
        
        // If user is logged in, update their stats
        if (context.userId && gameState?.players) {
          // Calculate score
          const difficultyMultiplier = { 'EASY': 1, 'MEDIUM': 1.5, 'HARD': 2 }[difficulty];
          const score = Math.floor((totalSafeCells * 10 * difficultyMultiplier) / (finalTime / 60 + 1));
          
          // Debug before update
          debugPlayerStats(context.userId, "Before Win Update");
          
          // Find player and make a direct update
          const playerIndex = gameState.players.findIndex(p => p.id === context.userId);
          if (playerIndex !== -1) {
            // Create a new state object with updated player stats
            const updatedGameState = {
              ...gameState,
              players: [...gameState.players]
            };
            
            // Update player stats directly
            updatedGameState.players[playerIndex] = {
              ...updatedGameState.players[playerIndex],
              totalGamesPlayed: (updatedGameState.players[playerIndex].totalGamesPlayed || 0) + 1,
              totalGamesWon: (updatedGameState.players[playerIndex].totalGamesWon || 0) + 1,
              score: (updatedGameState.players[playerIndex].score || 0) + score
            };
            
            // Update global game state
            setGameState(updatedGameState);
            
            // Debug after update
            console.log("Player stats updated directly:", updatedGameState.players[playerIndex]);
            
            // Persist to Redis immediately
            await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
            
            // Post a victory comment if possible
            try {
              if (context.postId) {
                await context.reddit.submitComment({
                  text: `# Victory! 🎉\n\n${updatedGameState.players[playerIndex].username} cleared a ${difficulty} difficulty board!\n\nTime: ${formatTime(finalTime)}\nMoves: ${moveCount}\nScore: +${score}\n\nUse \`/play [difficulty]\` to start a new game.`,
                  id: context.postId
                });
              }
            } catch (commentError) {
              console.error("Error posting victory comment:", commentError);
            }
          }
        }
        
        // Update Redis state with general game state changes
        const updatedGameState = {
          ...gameState,
          currentPage: 'win',
          gameOver: true,
          streakCount: streakCount + 1,
          bestScore: newBestScore,
        };
        
        await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
      }
    };

    const debugPlayerStats = (userId, message) => {
      if (!gameState || !userId) return;
      
      const player = gameState.players.find(p => p.id === userId);
      if (!player) return;
      
      console.log(`PLAYER STATS [${message}] - ${player.username}:`, {
        totalGamesPlayed: player.totalGamesPlayed,
        totalGamesWon: player.totalGamesWon,
        score: player.score
      });
    };

    // Modified function to reveal adjacent cells with controlled depth
    const revealAdjacentCells = (grid, index, maxDepth = 1, currentDepth = 0) => {
      if (currentDepth >= maxDepth) return;
      
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      
      // Check all 8 adjacent cells
      for (let r = -1; r <= 1; r++) {
        for (let c = -1; c <= 1; c++) {
          if (r === 0 && c === 0) continue;
          
          const newRow = row + r;
          const newCol = col + c;
          
          // Check if the adjacent cell is valid
          if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
            const adjacentIndex = newRow * gridSize + newCol;
            
            // Only process unrevealed and unflagged cells
            if (!grid[adjacentIndex].revealed && !grid[adjacentIndex].flagged) {
              grid[adjacentIndex].revealed = true;
              
              // If it's also an empty cell and we haven't reached max depth, reveal its adjacent cells
              if (grid[adjacentIndex].type === CELL_TYPES.EMPTY && currentDepth < maxDepth - 1) {
                revealAdjacentCells(grid, adjacentIndex, maxDepth, currentDepth + 1);
              }
            }
          }
        }
      }
    };
    
    // Toggle flag on a cell
    const toggleFlag = async (index) => {
      if (gameOver || grid[index].revealed) {
        return;
      }
      
      const newGrid = [...grid];
      newGrid[index].flagged = !newGrid[index].flagged;
      
      // Update flag count
      const newFlagCount = newGrid.filter(cell => cell.flagged).length;
      setFlagCount(newFlagCount);
      
      setGrid(newGrid);
      setMoveCount(moveCount + 1);
      
      // Update Redis state
      const updatedGameState = {
        ...gameState,
        grid: newGrid,
        flagCount: newFlagCount,
        moveCount: moveCount + 1,
      };
      await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
      setGameState(updatedGameState);
    };
    
    // Toggle flag mode
    const toggleFlagMode = () => {
      setFlagMode(!flagMode);
    };
    
    // Reveal additional cells as a hint
    const revealHint = async () => {
      if (gameOver) return;
      
      const newGrid = [...grid];
      const unrevealed = newGrid
        .map((cell, index) => ({ cell, index }))
        .filter(item => !item.cell.revealed && !item.cell.flagged && item.cell.type !== CELL_TYPES.BOMB);
      
      if (unrevealed.length > 0) {
        // Reveal up to 3 random safe cells as a hint
        const numToReveal = Math.min(3, unrevealed.length);
        const shuffled = unrevealed.sort(() => 0.5 - Math.random());
        
        for (let i = 0; i < numToReveal; i++) {
          const index = shuffled[i].index;
          newGrid[index].revealed = true;
          
          // Apply animation effect
          newGrid[index].animating = true;
          setGrid([...newGrid]);
          
          // If it's an empty cell, also reveal only immediate adjacent cells with a delay
          if (newGrid[index].type === CELL_TYPES.EMPTY) {
            setTimeout(() => {
              const gradualGrid = [...newGrid];
              gradualGrid[index].animating = false;
              
              // Use different reveal depths based on difficulty
              const revealDepth = DIFFICULTY[difficulty].depth;
              revealAdjacentCells(gradualGrid, index, revealDepth);
              setGrid(gradualGrid);
              
              // Update revealed count
              const revealed = gradualGrid.filter(cell => cell.revealed).length;
              setRevealedCount(revealed);
              
              // Check win condition
              checkWinCondition(gradualGrid, revealed);
              
              // Update Redis state
              const updatedGameState = {
                ...gameState,
                grid: gradualGrid,
                revealedCount: revealed,
                moveCount: moveCount + numToReveal,
              };
              context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
              setGameState(updatedGameState);
            }, 150); // Small delay for gradual effect
          }
        }
        
        setGrid(newGrid);
        setMoveCount(moveCount + numToReveal);
        
        // Count revealed cells
        const revealed = newGrid.filter(cell => cell.revealed).length;
        setRevealedCount(revealed);
        
        // Check if game is won
        const totalSafeCells = newGrid.length - bombCount;
        if (revealed === totalSafeCells) {
          setGameOver(true);
          setStreakCount(streakCount + 1);
          
          const finalTime = Math.floor((Date.now() - gameStartTime) / 1000);
          let newBestScore = {...bestScore};
          
          // Update best score if applicable
          if (bestScore[difficulty].time === Infinity || 
              finalTime < bestScore[difficulty].time) {
            newBestScore[difficulty] = {time: finalTime, revealed};
            setBestScore(newBestScore);
          }
          
          setCurrentPage('win');
          
          // Update Redis state
          const updatedGameState = {
            ...gameState,
            currentPage: 'win',
            grid: newGrid,
            revealedCount: revealed,
            gameOver: true,
            moveCount: moveCount + numToReveal,
            streakCount: streakCount + 1,
            bestScore: newBestScore,
          };
          await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
          setGameState(updatedGameState);
        } else {
          // Just update Redis state
          const updatedGameState = {
            ...gameState,
            grid: newGrid,
            revealedCount: revealed,
            moveCount: moveCount + numToReveal,
          };
          await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
          setGameState(updatedGameState);
        }
      }
    };
    
    // Handle user joining the game
    const handleJoinGame = async () => {
      if (!gameState) return;
      
      const user = await context.reddit.getCurrentUser();
      if (!user) return;
      
      if (gameState.players.find(p => p.id === user.id)) return;
      
      const newPlayer = {
        id: user.id,
        username: user.username,
        moves: 0,
        score: 0,
        totalGamesPlayed: 0,
        totalGamesWon: 0,
      };
      
      const updatedGameState = {
        ...gameState,
        players: [...gameState.players, newPlayer],
      };
      
      await context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
      setGameState(updatedGameState);
      
      // Post a welcome comment
      if (context.postId) {
        await context.reddit.submitComment({
          text: `Welcome to Crossmines, ${user.username}!\n\nUse the in-game controls to play, or try these commands in comments:\n- \`/play [difficulty]\` - Start a new game\n- \`/reveal row col\` - Reveal a cell\n- \`/flag row col\` - Flag a potential bomb\n- \`/leaderboard\` - Show player rankings`,
          id: context.postId
        });
      }
    };
    
    // Render the Win page
    const renderWinPage = () => {
      const finalTime = Math.floor((Date.now() - gameStartTime) / 1000);
      const isNewBest = bestScore[difficulty].time === finalTime &&
                        bestScore[difficulty].revealed === revealedCount;
      
      return (
        <vstack 
          width="100%" 
          height="100%" 
          alignment="middle center" 
          gap="large" 
          padding="large"
          backgroundColor={THEME.background}
        >
          <vstack alignment="middle center" gap="medium">
            <text size="xxlarge" weight="bold" color={THEME.accentSecondary}>You Win!</text>
            <text size="large" color={THEME.textPrimary}>
              ✨ Bomb Free Victory! ✨
            </text>
            {streakCount > 1 && (
              <text color={THEME.accentSecondary}>
                🔥 {streakCount} Win Streak!
              </text>
            )}
          </vstack>
          
          <Section>
            <vstack alignment="middle center" gap="medium">
              <hstack gap="large">
                <vstack alignment="middle center">
                  <text color={THEME.textSecondary}>Moves</text>
                  <text size="xlarge" weight="bold" color={THEME.textPrimary}>{moveCount}</text>
                </vstack>
                <vstack alignment="middle center">
                  <text color={THEME.textSecondary}>Time</text>
                  <text size="xlarge" weight="bold" color={THEME.textPrimary}>{formatTime(finalTime)}</text>
                </vstack>
              </hstack>
              <text color={THEME.textSecondary} size="small">
                {DIFFICULTY[difficulty].name} • {gridSize}×{gridSize}
              </text>
            </vstack>
          </Section>
          
          {isNewBest && (
            <vstack 
              backgroundColor="rgba(3, 218, 198, 0.15)" 
              padding="medium" 
              cornerRadius="medium"
              alignment="middle center"
            >
              <text weight="bold" color={THEME.accentSecondary}>New Best Score!</text>
            </vstack>
          )}
          
          <hstack gap="medium">
            <ThemedButton onPress={() => setCurrentPage('home')}>
              Home
            </ThemedButton>
            <ThemedButton 
              primary
              onPress={startGame}
            >
              Play Again
            </ThemedButton>
          </hstack>
        </vstack>
      );
    };
    
    // Render the Lose page
    const renderLosePage = () => {
      const finalTime = Math.floor((Date.now() - gameStartTime) / 1000);
  
      // Reset streak on loss
      if (streakCount > 0) {
        setStreakCount(0);
        
        // Update Redis state
        if (gameState) {
          const updatedGameState = {
            ...gameState,
            streakCount: 0
          };
          context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
          setGameState(updatedGameState);
        }
      }
      
      // ADD THIS CODE HERE - Update player stats for loss
      if (context.userId && gameState?.players) {
        // Debug before update
        debugPlayerStats(context.userId, "Before Loss Update");
        
        // Find player and make a direct update
        const playerIndex = gameState.players.findIndex(p => p.id === context.userId);
        if (playerIndex !== -1) {
          // Create a new state object with updated player stats
          const updatedGameState = {
            ...gameState,
            players: [...gameState.players]
          };
          
          // Update player stats directly - only increment games played
          updatedGameState.players[playerIndex] = {
            ...updatedGameState.players[playerIndex],
            totalGamesPlayed: (updatedGameState.players[playerIndex].totalGamesPlayed || 0) + 1
          };
          
          // Update global game state
          setGameState(updatedGameState);
          
          // Debug after update
          console.log("Player stats updated after loss:", updatedGameState.players[playerIndex]);
          
          // Persist to Redis immediately
          context.redis.set(`bombsweeper_${context.postId}`, JSON.stringify(updatedGameState));
        }
      }  
      return (
        <vstack 
          width="100%" 
          height="100%" 
          alignment="middle center" 
          gap="large" 
          padding="large"
          backgroundColor={THEME.background}
        >
          <vstack alignment="middle center" gap="medium">
            <text size="xxlarge" weight="bold" color={THEME.error}>Boom! Game Over</text>
            <text size="large" color={THEME.textSecondary}>
              You hit a bomb! 💣
            </text>
          </vstack>
          
          <Section>
            <vstack alignment="middle center" gap="medium">
              <hstack gap="large">
                <vstack alignment="middle center">
                  <text color={THEME.textSecondary}>Revealed</text>
                  <text size="xlarge" weight="bold" color={THEME.textPrimary}>
                    {revealedCount}/{grid.length - bombCount}
                  </text>
                </vstack>
                <vstack alignment="middle center">
                  <text color={THEME.textSecondary}>Time</text>
                  <text size="xlarge" weight="bold" color={THEME.textPrimary}>{formatTime(finalTime)}</text>
                </vstack>
              </hstack>
              <text color={THEME.textSecondary} size="small">
                {DIFFICULTY[difficulty].name} • {gridSize}×{gridSize}
              </text>
            </vstack>
            </Section>
          
          <hstack gap="medium">
            <ThemedButton onPress={() => setCurrentPage('home')}>
              Home
            </ThemedButton>
            <ThemedButton 
              primary
              onPress={startGame}
            >
              Try Again
            </ThemedButton>
          </hstack>
        </vstack>
      );
    };
    
    // Show loading state if data isn't ready
    if (isLoading) {
      return (
        <vstack alignment="middle center" height="100%" backgroundColor={THEME.background}>
          <text size="large" color={THEME.textPrimary}>Loading Crossmines...</text>
        </vstack>
      );
    }
    
    // Render the Home page
    const renderHomePage = () => {
      return (
        <vstack 
          width="100%" 
          height="100%" 
          alignment="middle center" 
          gap="large" 
          padding="large"
          backgroundColor={THEME.background}
        >
          <vstack alignment="middle center" gap="medium">
            <text size="xxlarge" weight="bold" color={THEME.accent}>Crossmines</text>
            <text color={THEME.textSecondary} alignment="center">Reveal all safe cells without hitting any bombs</text>
          </vstack>
          
          <vstack gap="medium" width="95%">
            <ThemedButton primary onPress={() => setCurrentPage('setup')}>
              New Game
            </ThemedButton>
            
            <ThemedButton onPress={() => setCurrentPage('leaderboard')}>
              Leaderboard
            </ThemedButton>
            
            {context.userId && !gameState?.players?.find(p => p.id === context.userId) && (
              <ThemedButton onPress={handleJoinGame}>
                Join Game
              </ThemedButton>
            )}
          </vstack>
          
          <vstack gap="small" width="95%" alignment="middle center">
            <text size="small" color={THEME.textSecondary}>
              Reveal cells by tapping them, but beware of bombs!
            </text>
            <text size="small" color={THEME.textSecondary}>
              Use flag mode to mark potential bomb locations.
            </text>
            <text size="small" color={THEME.textSecondary}>
              You can also play via comments with /play, /reveal and /flag commands.
            </text>
          </vstack>
        </vstack>
      );
    };
    
    // Render the Setup page with difficulty selection
    const renderSetupPage = () => {
      return (
        <vstack 
          width="100%" 
          height="100%" 
          alignment="middle center" 
          gap="medium" 
          padding="medium"
          backgroundColor={THEME.background}
        >
          <vstack alignment="middle center" gap="small">
            <text size="xlarge" weight="bold" color={THEME.accent}>Game Settings</text>
            <text color={THEME.textSecondary}>Customize your game</text>
          </vstack>
          
          <Section title="Difficulty">
            <hstack gap="small" wrap="wrap" alignment="middle center">
              {Object.keys(DIFFICULTY).map(diff => (
                <ThemedButton 
                  primary={difficulty === diff}
                  onPress={() => setDifficulty(diff)}
                >
                  {DIFFICULTY[diff].name}
                </ThemedButton>
              ))}
            </hstack>
            <text size="xsmall" color={THEME.textSecondary} alignment="center">
              {difficulty === 'EASY' ? 'Fewer bombs (10%), deeper reveals' : 
               difficulty === 'MEDIUM' ? 'Medium bombs (15%)' : 
               'More bombs (20%), challenging!'}
            </text>
          </Section>
          
          <Section title="Grid Size">
            <hstack gap="small" wrap="wrap" alignment="middle center">
              {[6, 8, 10, 12].map(size => (
                <ThemedButton 
                  primary={gridSize === size}
                  onPress={() => setGridSize(size)}
                >
                  {size}×{size}
                </ThemedButton>
              ))}
            </hstack>
          </Section>
          
          {/* Display best scores if they exist */}
          {bestScore[difficulty].time !== Infinity && (
            <Section title="Best Score">
              <vstack alignment="middle center">
                <text color={THEME.accentSecondary} weight="bold">
                  {formatTime(bestScore[difficulty].time)} with {bestScore[difficulty].revealed} cells revealed
                </text>
              </vstack>
            </Section>
          )}
          
          <hstack gap="medium" width="95%" alignment="middle center">
            <ThemedButton onPress={() => setCurrentPage('home')}>
              Back
            </ThemedButton>
            <ThemedButton primary onPress={startGame}>
              Start Game
            </ThemedButton>
          </hstack>
        </vstack>
      );
    };
    
    // Render the Game page
    const renderGamePage = () => {
      // Adjust cell size based on grid size
      const maxSize = 240;
      const cellSize = `${Math.min(Math.floor(maxSize / gridSize), 40)}px`;
      
      // Calculate progress (percentage of non-bomb cells revealed)
      const totalSafeCells = grid.length - bombCount;
      const progressPercent = (revealedCount / totalSafeCells) * 100;
      
      return (
        <vstack 
          width="100%" 
          height="100%" 
          alignment="middle center" 
          gap="medium" 
          padding="medium"
          backgroundColor={THEME.background}
        >
          <hstack width="95%" alignment="middle space-between">
            <vstack gap="xsmall">
              <text weight="bold" color={THEME.textPrimary}>Moves: {moveCount}</text>
              <text color={THEME.textSecondary}>
                Time: {formatTime(timeElapsed)}
              </text>
              {streakCount > 0 && (
                <text size="small" color={THEME.accentSecondary}>
                  🔥 Win Streak: {streakCount}
                </text>
              )}
            </vstack>
            
            <hstack gap="small">
              <ThemedButton 
                small 
                primary={flagMode}
                onPress={toggleFlagMode}
              >
                {flagMode ? "🚩 Flag Mode" : "🔍 Reveal Mode"}
              </ThemedButton>
              <ThemedButton 
                small
                onPress={() => setCurrentPage('home')}
              >
                Menu
              </ThemedButton>
            </hstack>
          </hstack>
          
          {/* Progress bar and bombs counter */}
          <hstack width="95%" gap="small">
            <vstack width="47%" gap="xsmall">
              <text size="xsmall" color={THEME.textSecondary}>Progress</text>
              <hstack width="100%" height="6px" backgroundColor={THEME.progressBackground} cornerRadius="medium">
                <hstack 
                  width={`${progressPercent}%`} 
                  height="100%" 
                  backgroundColor={THEME.accentSecondary} 
                  cornerRadius="medium" 
                />
              </hstack>
            </vstack>
            
            <vstack width="47%" gap="xsmall">
              <text size="xsmall" color={THEME.textSecondary}>Bombs: {bombCount - flagCount} / {bombCount}</text>
              <hstack width="100%" height="6px" backgroundColor={THEME.progressBackground} cornerRadius="medium">
                <hstack 
                  width={`${(flagCount / bombCount) * 100}%`} 
                  height="100%" 
                  backgroundColor={THEME.accent} 
                  cornerRadius="medium" 
                />
              </hstack>
            </vstack>
          </hstack>
          
          {/* Game info */}
          <hstack width="95%" alignment="start">
            <text size="xsmall" color={THEME.textSecondary}>
              {gridSize}×{gridSize} • {DIFFICULTY[difficulty].name} • {revealedCount}/{totalSafeCells} cells revealed
            </text>
          </hstack>
          
          {/* Game grid */}
          <vstack width="auto" gap="xsmall" alignment="middle center" padding="xsmall">
            {Array.from({ length: gridSize }).map((_, rowIndex) => (
              <hstack gap="xsmall">
                {Array.from({ length: gridSize }).map((_, colIndex) => {
                  const index = rowIndex * gridSize + colIndex;
                  const cell = grid[index];
                  
                  // Determine cell appearance
                  let cellBg = THEME.cellUnrevealed;
                  let cellContent = '';
                  let cellTextColor = THEME.textPrimary;
                  
                  if (cell.revealed) {
                    cellBg = THEME.cellRevealed;
                    
                    if (cell.type === CELL_TYPES.BOMB) {
                      cellBg = THEME.cellBomb;
                      cellContent = '💣';
                    } else if (cell.type === CELL_TYPES.NUMBER) {
                      // Color-coded numbers based on value
                      switch(cell.value) {
                        case 1: cellTextColor = '#3498db'; break; // blue
                        case 2: cellTextColor = '#2ecc71'; break; // green
                        case 3: cellTextColor = '#e74c3c'; break; // red
                        case 4: cellTextColor = '#9b59b6'; break; // purple
                        case 5: cellTextColor = '#f1c40f'; break; // yellow
                        case 6: cellTextColor = '#1abc9c'; break; // teal
                        case 7: cellTextColor = '#e67e22'; break; // orange
                        case 8: cellTextColor = '#7f8c8d'; break; // gray
                      }
                      cellContent = cell.value.toString();
                    }
                  } else if (cell.flagged) {
                    cellContent = '🚩';
                  }
                  
                  // Animation effect for newly revealed cells
                  const animationStyle = cell.animating ? 
                    { backgroundColor: THEME.safeReveal } : {};
                  
                  return (
                    <vstack
                      width={cellSize}
                      height={cellSize}
                      backgroundColor={cellBg}
                      border="thin"
                      borderColor={flagMode && !cell.revealed ? THEME.accent : 'rgba(255, 255, 255, 0.1)'}
                      cornerRadius="small"
                      alignment="middle center"
                      onPress={() => revealCell(index)}
                      {...animationStyle}
                    >
                      <text 
                        size={cell.type === CELL_TYPES.BOMB ? "large" : "medium"} 
                        weight={cell.type === CELL_TYPES.NUMBER ? "bold" : "regular"}
                        color={cellTextColor}
                      >
                        {cellContent}
                      </text>
                    </vstack>
                  );
                })}
              </hstack>
            ))}
          </vstack>
          
          {/* Hint button */}
          <hstack gap="small" alignment="middle center">
            <ThemedButton small onPress={revealHint}>
              💡 Hint (Reveal Safe Cells)
            </ThemedButton>
          </hstack>
          
          {/* Game instructions */}
          <hstack 
            gap="xsmall" 
            backgroundColor="rgba(255, 255, 255, 0.05)" 
            padding="xsmall"
            paddingLeft="small"
            paddingRight="small"
            cornerRadius="medium"
          >
            <text size="small" color={THEME.textSecondary}>
              {flagMode ? "Tap to place flags" : "Tap to reveal cells"}
            </text>
          </hstack>
        </vstack>
      );
    };

    // Render the enhanced Leaderboard page with player stats
    const renderLeaderboardPage = () => {
      const sortedPlayers = [...(gameState?.players || [])].sort((a, b) => b.score - a.score);
      
      return (
        <vstack 
          width="100%" 
          height="100%" 
          alignment="middle center" 
          gap="large" 
          padding="large"
          backgroundColor={THEME.background}
        >
          <vstack alignment="middle center" gap="small">
            <text size="xlarge" weight="bold" color={THEME.accent}>Leaderboard</text>
            <text color={THEME.textSecondary}>Top Crossminers</text>
          </vstack>
          
          <Section>
            <vstack gap="medium" width="100%">
              {sortedPlayers.length > 0 ? (
                sortedPlayers.map((player, index) => (
                  <vstack 
                    gap="small" 
                    padding="small" 
                    cornerRadius="medium" 
                    backgroundColor="rgba(187, 134, 252, 0.1)"
                  >
                    <hstack alignment="middle space-between">
                      <text weight="bold" color={THEME.accent}>
                        #{index + 1} {player.username}
                      </text>
                      <text weight="bold" color={THEME.textPrimary}>
                        Score: {player.score}
                      </text>
                    </hstack>
                    
                    <hstack gap="medium" alignment="middle space-between" width="100%">
                      <vstack>
                        <text size="small" color={THEME.textSecondary}>Games Played</text>
                        <text weight="bold" color={THEME.textPrimary}>
                          {player.totalGamesPlayed}
                        </text>
                      </vstack>
                      
                      <vstack>
                        <text size="small" color={THEME.textSecondary}>Games Won</text>
                        <text weight="bold" color={THEME.textPrimary}>
                          {player.totalGamesWon}
                        </text>
                      </vstack>
                      
                      <vstack>
                        <text size="small" color={THEME.textSecondary}>Win Rate</text>
                        <text weight="bold" color={THEME.textPrimary}>
                          {player.totalGamesPlayed > 0 
                            ? `${Math.round((player.totalGamesWon / player.totalGamesPlayed) * 100)}%` 
                            : '0%'}
                        </text>
                      </vstack>
                    </hstack>
                  </vstack>
                ))
              ) : (
                <vstack alignment="middle center" padding="medium">
                  <text color={THEME.textSecondary}>No players yet!</text>
                  <text size="small" color={THEME.textSecondary} paddingTop="small">
                    Use /join in the comments to add yourself to the leaderboard
                  </text>
                </vstack>
              )}
            </vstack>
          </Section>
          
{/* Best scores section */}
<Section title="Best Times">
            <vstack gap="medium" width="100%">
              {Object.keys(DIFFICULTY).map(diff => (
                <hstack 
                  gap="small" 
                  padding="small" 
                  cornerRadius="medium" 
                  backgroundColor="rgba(3, 218, 198, 0.1)"
                  alignment="middle space-between"
                >
                  <text weight="bold" color={THEME.textPrimary}>
                    {DIFFICULTY[diff].name}
                  </text>
                  
                  {bestScore[diff].time !== Infinity ? (
                    <text weight="bold" color={THEME.accentSecondary}>
                      {formatTime(bestScore[diff].time)}
                    </text>
                  ) : (
                    <text color={THEME.textSecondary}>No record yet</text>
                  )}
                </hstack>
              ))}
            </vstack>
          </Section>

          <ThemedButton onPress={() => setCurrentPage('home')}>
            Back to Home
          </ThemedButton>
        </vstack>
      );
    };
    
    // Main render function - determine which page to show
    return (
      <blocks>
        {currentPage === 'home' && renderHomePage()}
        {currentPage === 'setup' && renderSetupPage()}
        {currentPage === 'game' && renderGamePage()}
        {currentPage === 'win' && renderWinPage()}
        {currentPage === 'lose' && renderLosePage()}
        {currentPage === 'leaderboard' && renderLeaderboardPage()}
      </blocks>
    );
  }
});
// Menu item to create new game
Devvit.addMenuItem({
  label: 'Create Crossmines Game',
  location: 'subreddit',
  onPress: async (_, context) => {
    const { reddit, ui } = context;
    const subreddit = await reddit.getCurrentSubreddit();
    
    const post = await reddit.submitPost({
      title: 'Crossmines Challenge',
      subredditName: subreddit.name,
      preview: (
        <vstack padding="medium" cornerRadius="medium" backgroundColor="#121212">
          <text style="heading" size="medium" color="#BB86FC">
            Loading Crossmines Game...
          </text>
        </vstack>
      ),
    });
    
    ui.showToast({ text: 'Crossmines game created!' });
    ui.navigateTo(post);
  }
});

// Comment commands handler for game interaction
Devvit.addTrigger({
  event: 'CommentCreate',
  async onEvent(event, context) {
    if (!event.comment?.postId) return;
    const storedState = await context.redis.get(`bombsweeper_${event.comment.postId}`);
    if (!storedState) return;
    
    const gameState = JSON.parse(storedState);
    const comment = event.comment;
    if (!comment) return;
    
    // Parse commands in comments
    const commandMatch = comment.body.match(/^\/([a-z_]+)(?: (.+))?$/i);
    if (!commandMatch) return;
    
    const command = commandMatch[1].toLowerCase();
    const args = commandMatch[2] || '';
    
    try {
      const user = await context.reddit.getUserById(comment.author);
      
      // Handle different commands
      switch (command) {
        case 'join':
          // Add player to the game
          if (!gameState.players.find(p => p.id === user.id)) {
            gameState.players.push({
              id: user.id,
              username: user.username,
              moves: 0,
              score: 0,
              totalGamesPlayed: 0,
              totalGamesWon: 0,
            });
            
            await context.reddit.submitComment({
              text: `@${user.username} has joined the game! Use /play to start a new game.`,
              id: comment.parentId
            });
          } else {
            await context.reddit.submitComment({
              text: `@${user.username} You're already playing!`,
              id: comment.parentId
            });
          }
          break;
          
        case 'play':
          // Start a new game with selected difficulty
          if (!gameState.players.find(p => p.id === user.id)) {
            await context.reddit.submitComment({
              text: `@${user.username} Please use /join first to join the game.`,
              id: comment.parentId
            });
            return;
          }
          
          // Parse difficulty
          let difficulty = 'MEDIUM';
          if (args && ['EASY', 'MEDIUM', 'HARD'].includes(args.toUpperCase())) {
            difficulty = args.toUpperCase();
          }
          
          // Initialize a new game
          const gridSize = 8; // Default to 8x8 for comments
          const difficultySettings = {
            'EASY': { bombPercentage: 0.1, depth: 2 },
            'MEDIUM': { bombPercentage: 0.15, depth: 1 },
            'HARD': { bombPercentage: 0.2, depth: 1 },
          }[difficulty];
          
          const totalCells = gridSize * gridSize;
          const bombsToPlace = Math.floor(totalCells * difficultySettings.bombPercentage);
          
          // Create empty grid
          const newGrid = Array(totalCells).fill(null).map(() => ({
            type: 0, // EMPTY
            value: 0,
            revealed: false,
            flagged: false,
          }));
          
          // Place bombs randomly
          let bombsPlaced = 0;
          while (bombsPlaced < bombsToPlace) {
            const randomIndex = Math.floor(Math.random() * totalCells);
            if (newGrid[randomIndex].type !== 1) { // Not a BOMB
              newGrid[randomIndex].type = 1; // BOMB
              bombsPlaced++;
            }
          }
          
          // Calculate numbers for adjacent bombs
          for (let i = 0; i < totalCells; i++) {
            if (newGrid[i].type === 1) continue; // Skip bombs
            
            // Get row and column
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            
            // Check all 8 adjacent cells for bombs
            let adjacentBombs = 0;
            for (let r = -1; r <= 1; r++) {
              for (let c = -1; c <= 1; c++) {
                if (r === 0 && c === 0) continue;
                
                const newRow = row + r;
                const newCol = col + c;
                
                // Check if the adjacent cell is valid
                if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
                  const adjacentIndex = newRow * gridSize + newCol;
                  if (newGrid[adjacentIndex].type === 1) { // BOMB
                    adjacentBombs++;
                  }
                }
              }
            }
            
            if (adjacentBombs > 0) {
              newGrid[i].type = 2; // NUMBER
              newGrid[i].value = adjacentBombs;
            }
          }
          
          // Update player
          const playerIndex = gameState.players.findIndex(p => p.id === user.id);
          gameState.players[playerIndex].currentGrid = newGrid;
          gameState.players[playerIndex].currentGridSize = gridSize;
          gameState.players[playerIndex].currentDifficulty = difficulty;
          gameState.players[playerIndex].currentBombCount = bombsToPlace;
          gameState.players[playerIndex].currentFlagCount = 0;
          gameState.players[playerIndex].currentRevealedCount = 0;
          gameState.players[playerIndex].currentGameOver = false;
          gameState.players[playerIndex].currentMoveCount = 0;
          gameState.players[playerIndex].startTime = Date.now();
          gameState.players[playerIndex].totalGamesPlayed++;
          
          // Generate ASCII grid for display
          const asciiGrid = generateAsciiGrid(newGrid, gridSize);
          
          await context.reddit.submitComment({
            text: `@${user.username} started a new ${difficulty} game!\n\nBombs: ${bombsToPlace}\n\n${asciiGrid}\n\nUse /reveal row col to reveal a cell (e.g., /reveal 3 4)\nUse /flag row col to flag a cell`,
            id: comment.parentId
          });
          break;
          
        case 'reveal':
          // Handle cell reveal
          if (!gameState.players.find(p => p.id === user.id)) {
            await context.reddit.submitComment({
              text: `@${user.username} Please use /join first to join the game.`,
              id: comment.parentId
            });
            return;
          }
          
          const revealPlayer = gameState.players.find(p => p.id === user.id);
          if (!revealPlayer.currentGrid) {
            await context.reddit.submitComment({
              text: `@${user.username} Please start a game first with /play.`,
              id: comment.parentId
            });
            return;
          }
          
          if (revealPlayer.currentGameOver) {
            await context.reddit.submitComment({
              text: `@${user.username} Your game is over. Start a new game with /play.`,
              id: comment.parentId
            });
            return;
          }
          
          // Parse row and column
          const revealCoords = args.match(/(\d+)\s+(\d+)/);
          if (!revealCoords) {
            await context.reddit.submitComment({
              text: `@${user.username} Invalid coordinates. Use format: /reveal row col (e.g., /reveal 3 4)`,
              id: comment.parentId
            });
            return;
          }
          
          const revealRow = parseInt(revealCoords[1]) - 1; // Convert to 0-based
          const revealCol = parseInt(revealCoords[2]) - 1;
          const revealGridSize = revealPlayer.currentGridSize;

          // Validate coordinates
          if (
            revealRow < 0 || 
            revealRow >= gridSize || 
            revealCol < 0 || 
            revealCol >= gridSize
          ) {
            await context.reddit.submitComment({
              text: `@${user.username} Coordinates out of bounds. Grid size is ${gridSize}x${gridSize}.`,
              id: comment.parentId
            });
            return;
          }
          
          // Get cell index
          const cellIndex = revealRow * gridSize + revealCol;
          const grid = revealPlayer.currentGrid;
          
          // Check if already revealed or flagged
          if (grid[cellIndex].revealed) {
            await context.reddit.submitComment({
              text: `@${user.username} This cell is already revealed.`,
              id: comment.parentId
            });
            return;
          }
          
          if (grid[cellIndex].flagged) {
            await context.reddit.submitComment({
              text: `@${user.username} This cell is flagged. Remove the flag first with /flag ${revealRow + 1} ${revealCol + 1}.`,
              id: comment.parentId
            });
            return;
          }
          
          // Handle bomb reveal
          if (grid[cellIndex].type === 1) { // BOMB
            grid[cellIndex].revealed = true;
            
            // Reveal all bombs
            for (let i = 0; i < grid.length; i++) {
              if (grid[i].type === 1) {
                grid[i].revealed = true;
              }
            }
            
            // Update player state
            const revealPlayerIndex = gameState.players.findIndex(p => p.id === user.id);
            gameState.players[playerIndex].currentGrid = grid;
            gameState.players[playerIndex].currentGameOver = true;
            gameState.players[playerIndex].currentMoveCount++;
            
            // Generate ASCII grid for display
            const loseGrid = generateAsciiGrid(grid, gridSize, true);
            
            await context.reddit.submitComment({
              text: `@${user.username} BOOM! You hit a bomb at ${revealRow + 1},${revealCol + 1}!\n\n${loseGrid}\n\nGame Over. Use /play to start a new game.`,
              id: comment.parentId
            });
            
            // Save updated state
            await context.redis.set(`bombsweeper_${event.comment.postId}`, JSON.stringify(gameState));
            return;
          }
          
          // Reveal the cell and potentially connected cells
          revealConnectedCells(grid, cellIndex, gridSize);
          
          // Update player state
          const revealPlayerIndex = gameState.players.findIndex(p => p.id === user.id);
          gameState.players[playerIndex].currentGrid = grid;
          gameState.players[playerIndex].currentMoveCount++;
          
          // Count revealed cells
          const revealedCount = grid.filter(cell => cell.revealed).length;
          gameState.players[playerIndex].currentRevealedCount = revealedCount;
          
          // Check for win condition
          const totalSafeCells = grid.length - revealPlayer.currentBombCount;
          if (revealedCount === totalSafeCells) {
            gameState.players[playerIndex].currentGameOver = true;
            gameState.players[playerIndex].totalGamesWon++;
            
            // Calculate score based on difficulty, grid size, and time
            const timeElapsed = Math.floor((Date.now() - revealPlayer.startTime) / 1000);
            const difficultyMultiplier = { 'EASY': 1, 'MEDIUM': 1.5, 'HARD': 2 }[revealPlayer.currentDifficulty];
            const score = Math.floor((totalSafeCells * 10 * difficultyMultiplier) / (timeElapsed / 60 + 1));
            
            gameState.players[playerIndex].score += score;
            
            // Generate ASCII grid for display
            const winGrid = generateAsciiGrid(grid, gridSize, true);
            
            await context.reddit.submitComment({
              text: `@${user.username} YOU WIN! All safe cells revealed!\n\n${winGrid}\n\nTime: ${formatTime(timeElapsed)}\nMoves: ${gameState.players[playerIndex].currentMoveCount}\nScore: +${score}\n\nUse /play to start a new game.`,
              id: comment.parentId
            });
            
            // Save updated state
            await context.redis.set(`bombsweeper_${event.comment.postId}`, JSON.stringify(gameState));
            return;
          }
          
          // Generate ASCII grid for display
          const updatedGrid = generateAsciiGrid(grid, gridSize);
          
          await context.reddit.submitComment({
            text: `@${user.username} revealed ${revealRow + 1},${revealCol + 1}\n\n${updatedGrid}\n\nSafe cells: ${revealedCount}/${totalSafeCells}\nMoves: ${gameState.players[playerIndex].currentMoveCount}`,
            id: comment.parentId
          });
          break;
          
        case 'flag':
          // Handle flag toggle
// Handle flag toggle
if (!gameState.players.find(p => p.id === user.id)) {
  await context.reddit.submitComment({
    text: `@${user.username} Please use /join first to join the game.`,
    id: comment.parentId
  });
  return;
}

const flagPlayer = gameState.players.find(p => p.id === user.id);
if (!flagPlayer.currentGrid) {
  await context.reddit.submitComment({
    text: `@${user.username} Please start a game first with /play.`,
    id: comment.parentId
  });
  return;
}

if (flagPlayer.currentGameOver) {
  await context.reddit.submitComment({
    text: `@${user.username} Your game is over. Start a new game with /play.`,
    id: comment.parentId
  });
  return;
}

// Parse row and column
const flagCoords = args.match(/(\d+)\s+(\d+)/);
if (!flagCoords) {
  await context.reddit.submitComment({
    text: `@${user.username} Invalid coordinates. Use format: /flag row col (e.g., /flag 3 4)`,
    id: comment.parentId
  });
  return;
}

const flagRow = parseInt(flagCoords[1]) - 1; // Convert to 0-based
const flagCol = parseInt(flagCoords[2]) - 1;
const flagGridSize = flagPlayer.currentGridSize;

// Validate coordinates
if (
  flagRow < 0 || 
  flagRow >= flagGridSize || 
  flagCol < 0 || 
  flagCol >= flagGridSize
) {
  await context.reddit.submitComment({
    text: `@${user.username} Coordinates out of bounds. Grid size is ${flagGridSize}x${flagGridSize}.`,
    id: comment.parentId
  });
  return;
}

// Get cell index
const flagCellIndex = flagRow * flagGridSize + flagCol;
const flagGrid = flagPlayer.currentGrid;

// Check if already revealed
if (flagGrid[flagCellIndex].revealed) {
  await context.reddit.submitComment({
    text: `@${user.username} This cell is already revealed. You can't flag it.`,
    id: comment.parentId
  });
  return;
}

// Toggle flag
flagGrid[flagCellIndex].flagged = !flagGrid[flagCellIndex].flagged;

// Update flag count
const flagCount = flagGrid.filter(cell => cell.flagged).length;

// Update player state
const flagPlayerIndex = gameState.players.findIndex(p => p.id === user.id);
gameState.players[flagPlayerIndex].currentGrid = flagGrid;
gameState.players[flagPlayerIndex].currentFlagCount = flagCount;
gameState.players[flagPlayerIndex].currentMoveCount++;

// Generate ASCII grid for display
const flaggedGrid = generateAsciiGrid(flagGrid, flagGridSize);

const actionText = flagGrid[flagCellIndex].flagged ? "flagged" : "unflagged";

await context.reddit.submitComment({
  text: `@${user.username} ${actionText} ${flagRow + 1},${flagCol + 1}\n\n${flaggedGrid}\n\nFlags: ${flagCount}/${flagPlayer.currentBombCount}\nMoves: ${gameState.players[flagPlayerIndex].currentMoveCount}`,
  id: comment.parentId
});
break;

case 'leaderboard':
// Show leaderboard
const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);

let leaderboardText = "# Crossmines Leaderboard\n\n";
leaderboardText += "Rank | Player | Score | Games | Wins | Win Rate\n";
leaderboardText += "-----|--------|-------|-------|------|--------\n";

sortedPlayers.forEach((player, index) => {
  const winRate = player.totalGamesPlayed > 0 
    ? Math.round((player.totalGamesWon / player.totalGamesPlayed) * 100) 
    : 0;
  
  leaderboardText += `${index + 1} | ${player.username} | ${player.score} | ${player.totalGamesPlayed} | ${player.totalGamesWon} | ${winRate}%\n`;
});

if (sortedPlayers.length === 0) {
  leaderboardText += "No players yet!";
}

await context.reddit.submitComment({
  text: leaderboardText,
  id: comment.parentId
});
break;

case 'help':
// Show help
await context.reddit.submitComment({
  text: `# BombSweeper Commands

- \`/join\` - Join the game
- \`/play [difficulty]\` - Start a new game (EASY, MEDIUM, or HARD)
- \`/reveal row col\` - Reveal a cell (e.g., /reveal 3 4)
- \`/flag row col\` - Toggle flag on a cell
- \`/leaderboard\` - Show player rankings
- \`/help\` - Show this help message

## How to Play
1. The goal is to reveal all cells that don't contain bombs
2. Numbers show how many bombs are adjacent to that cell
3. Use flags to mark where you think bombs are located
4. Be careful - one wrong move and BOOM!`,
  id: comment.parentId
});
break;
}

// Save the updated state
await context.redis.set(`bombsweeper_${event.comment.postId}`, JSON.stringify(gameState));

} catch (error) {
console.error('Error processing command:', error);
}
}
});

// Helper functions for the comment-based game
function generateAsciiGrid(grid, gridSize, revealAll = false) {
let output = "```\n   ";

// Column headers
for (let col = 0; col < gridSize; col++) {
output += ` ${(col + 1).toString().padStart(2)} `;
}
output += "\n   ";

// Column header underline
for (let col = 0; col < gridSize; col++) {
output += "---";
}
output += "\n";

// Grid rows
for (let row = 0; row < gridSize; row++) {
output += `${(row + 1).toString().padStart(2)} |`;

for (let col = 0; col < gridSize; col++) {
const index = row * gridSize + col;
const cell = grid[index];

if (cell.flagged && !revealAll) {
output += " 🚩 ";
} else if (!cell.revealed && !revealAll) {
output += " □ ";
} else if (cell.type === 1) { // BOMB
output += " 💣 ";
} else if (cell.type === 2) { // NUMBER
output += ` ${cell.value} `;
} else {
output += "   ";
}
}
output += "\n";
}

output += "```";
return output;
}

function revealConnectedCells(grid, index, gridSize) {
if (grid[index].revealed || grid[index].flagged) return;

grid[index].revealed = true;

// If it's not an empty cell, stop recursion
if (grid[index].type !== 0) return;

// Get row and column
const row = Math.floor(index / gridSize);
const col = index % gridSize;

// Check all 8 adjacent cells
for (let r = -1; r <= 1; r++) {
for (let c = -1; c <= 1; c++) {
if (r === 0 && c === 0) continue;

const newRow = row + r;
const newCol = col + c;

// Check if the adjacent cell is valid
if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
const adjacentIndex = newRow * gridSize + newCol;
revealConnectedCells(grid, adjacentIndex, gridSize);
}
}
}
}

export default Devvit;