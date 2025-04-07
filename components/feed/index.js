import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  FlatList,
  SafeAreaView,
  Text,
  View,
  Dimensions,
  TouchableOpacity,
  AppState, // background handling
} from 'react-native';
import Post from '../post';
import Navbar from '../navbar';
import BottomBar from '../bottomBar';
// import { LinearGradient } from 'expo-linear-gradient';
import styles from './style';

const { height } = Dimensions.get('window');

// --- Configuration ---
// This is based on device performance and network conditions
const SPEED_THRESHOLD_SLOW = 1.0; // Pixels per millisecond
const SPEED_THRESHOLD_FAST = 3.5; // Pixels per millisecond
const PRELOAD_WINDOW_SLOW = 2;    // Preload N items before/after when scrolling slow
const PRELOAD_WINDOW_MEDIUM = 1; // Preload N items before/after when scrolling medium
const PRELOAD_WINDOW_FAST = 0;   // Preload N items before/after when scrolling fast
// --------------------

const array = [
  { id: 1, uri: 'https://drive.google.com/uc?export=download&id=1567uKxxJx9J5uvf0BbLU-Qipe0YZZl39' },
  { id: 2, uri: 'https://drive.google.com/uc?export=download&id=17QAoPwiSeQjm-v8uO3gp7BymemHCzh_T' },
  { id: 3, uri: 'https://drive.google.com/uc?export=download&id=19YlJ9AcQJxlocoe3puA5aHriaKtvufB8' },
  { id: 4, uri: 'https://drive.google.com/uc?export=download&id=1ZiEPJPjTlYUnOabU7UjnoFtrbT6JNKaJ' },
  { id: 5, uri: 'https://drive.google.com/uc?export=download&id=1h2Ns1ZKui5XPB8c1sUxHMPKB7ElVB5sW' },
  { id: 6, uri: 'https://drive.google.com/uc?export=download&id=1jrZaKS8ZkycMCCW9wdcLQuJTuh4p8WS0' },
  { id: 7, uri: 'https://drive.google.com/uc?export=download&id=1pqHpIZuIR3rCDhdYJkDB6BOYEcwV7ejG' },
];

// Helper to create a Map for quick index lookup from item ID
const createIndexMap = (data) => {
  const map = new Map();
  data.forEach((item, index) => {
    map.set(item.id.toString(), index);
  });
  return map;
};

export default function Feed() {
  const mediaRefs = useRef({});
  // const [showSurvey, setShowSurvey] = useState(false);
  const [maxScrollDepth, setMaxScrollDepth] = useState(0);
  const [timeSpent, setTimeSpent] = useState({});
  const [viewedItems, setViewedItems] = useState([]);
  // const [videoCount, setVideoCount] = useState(0);
  const lastViewedRef = useRef({ startTime: null, contentId: null });
  const flatListRef = useRef(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current; // Config for onViewableItemsChanged

  // Handles survey
  // const handleSurveySubmit = () => {
  //   setShowSurvey(false);
  // };

  // useEffect(() => {
  //   const appStateListener = AppState.addEventListener('change', (nextAppState) => {
  //     if (nextAppState === 'inactive' || nextAppState === 'background') {
  //       setShowSurvey(true);
  //     }
  //   });

  //   return () => {
  //     appStateListener.remove();
  //   };
  // }, []);

  // State for the item index map derived from the data array
  const [itemIndexMap, setItemIndexMap] = useState(() => createIndexMap(array));
  useEffect(() => {
    setItemIndexMap(createIndexMap(array));
  }, [array]); // Update map if data array instance changes

  // --- Scroll Speed Tracking ---
  const scrollPos = useRef(0);
  const lastScrollTime = useRef(Date.now());
  const scrollSpeed = useRef(0); // Stores the calculated scroll speed

  const onScroll = (event) => {
    const currentPos = event.nativeEvent.contentOffset.y;
    const currentTime = Date.now();
    const deltaT = currentTime - lastScrollTime.current;

    // Calculate speed only if enough time passed to avoid jitter/division by zero
    if (deltaT > 50) {
      const instantaneousSpeed = Math.abs((currentPos - scrollPos.current) / deltaT);
      // Use a simple smoothing (Exponential Moving Average)
      scrollSpeed.current = (scrollSpeed.current * 0.7) + (instantaneousSpeed * 0.3);

      lastScrollTime.current = currentTime;
      scrollPos.current = currentPos;
    }
  };
  // ---

  const onFactsPress = () => {
    console.log('Facts button clicked!');
  };

   // --- App State Handling (Pause on Background) ---
   useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState.match(/inactive|background/)) {
        console.log('App inactive/background - Pausing all videos');
        Object.values(mediaRefs.current).forEach(ref => ref?.pause());

        // Record time spent for the last viewed item when going inactive
        if (lastViewedRef.current.contentId) {
          const currentTime = Date.now();
          const lastContentId = lastViewedRef.current.contentId;
          const duration = currentTime - lastViewedRef.current.startTime;
          setTimeSpent((prevTimeSpent) => ({
            ...prevTimeSpent,
            [lastContentId]: (prevTimeSpent[lastContentId] || 0) + duration,
          }));
          // Reset start time as it's no longer being viewed
          lastViewedRef.current = { startTime: null, contentId: null };
        }
      } else if (nextAppState === 'active') {
        console.log('App active');
        // Playback for the visible item will be handled by onViewableItemsChanged
        // when the view potentially re-renders or viewability changes upon return.
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      appStateSubscription?.remove();
    };
  }, []); // Empty dependency array: runs only on mount/unmount
  // ---

   // --- Core Logic: Handle Viewable Items Change ---
   const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    const currentTime = Date.now();

    // --- Time Spent Tracking ---
    if (lastViewedRef.current.contentId !== null) {
      const lastContentId = lastViewedRef.current.contentId;
      const duration = currentTime - lastViewedRef.current.startTime;
      setTimeSpent((prevTimeSpent) => ({
        ...prevTimeSpent,
        [lastContentId]: (prevTimeSpent[lastContentId] || 0) + duration,
      }));
      // Reset immediately before potentially setting a new one
      lastViewedRef.current = { startTime: null, contentId: null };
    }
    // ---

    // Find the primary item currently in view
    const primaryItem = viewableItems.find(item => item.isViewable);

    // If no item is sufficiently viewable, do nothing (or pause last known item)
    if (!primaryItem) {
      // Optional: Could try to pause the item that just became non-viewable if needed
      return;
    }

    const currentItemIndex = primaryItem.index;
    const currentItemId = primaryItem.key;

    // --- Update Time Spent & Scroll Depth for the new primary item ---
    lastViewedRef.current = { startTime: currentTime, contentId: currentItemId };
    setMaxScrollDepth((prevDepth) => Math.max(prevDepth, currentItemIndex));
    // ---

    // Determine preload window size based on current scroll speed
    const currentSpeed = scrollSpeed.current;
    let preloadWindowSize;
    if (currentSpeed < SPEED_THRESHOLD_SLOW) {
      preloadWindowSize = PRELOAD_WINDOW_SLOW;
    } else if (currentSpeed < SPEED_THRESHOLD_FAST) {
      preloadWindowSize = PRELOAD_WINDOW_MEDIUM;
    } else {
      preloadWindowSize = PRELOAD_WINDOW_FAST;
    }

    // Calculate the range of indices to keep active (loaded/preloaded)
    const minActiveIndex = Math.max(0, currentItemIndex - preloadWindowSize);
    const maxActiveIndex = Math.min(array.length - 1, currentItemIndex + preloadWindowSize);

    // console.log(`Speed: ${currentSpeed.toFixed(2)}, Window: ${preloadWindowSize}, ActiveRange: ${minActiveIndex}-${maxActiveIndex}, Current: ${currentItemIndex}`);

    // --- Manage Video States (Play, Preload, Unload) ---
    Object.entries(mediaRefs.current).forEach(([key, cell]) => {
      if (!cell) return; // Skip if ref is somehow null

      const itemIndex = itemIndexMap.get(key); // Get index from map

      // If item associated with this ref is no longer in our data, unload it
      if (itemIndex === undefined) {
         cell.unload();
         return;
      }

      // Decide action based on index relative to the active window
      if (key === currentItemId) {
        // Play the primary visible item
        cell.play();
      } else if (itemIndex >= minActiveIndex && itemIndex <= maxActiveIndex) {
        // Preload (load data) and ensure items in the window are paused
        cell.preload();
        cell.pause(); // Ensure it remains paused after preloading
      } else {
        // Unload items far outside the active window
        cell.unload();
      }
    });
    // ---

  }, [array, itemIndexMap]); // Depend on data array and index map
  // ---



  // const handleViewableItemsChanged = useRef(({ viewableItems, changed }) => {
  //   const currentTime = Date.now();

  //   // Time spent tracking
  //   if (lastViewedRef.current.contentId !== null) {
  //     const lastContentId = lastViewedRef.current.contentId;
  //     const duration = currentTime - lastViewedRef.current.startTime;
  //     setTimeSpent((prevTimeSpent) => ({
  //       ...prevTimeSpent,
  //       [lastContentId]: (prevTimeSpent[lastContentId] || 0) + duration,
  //     }));

  //     lastViewedRef.current = { startTime: null, contentId: null }; // Reset before setting new one
  //   }

  //   // Added this
  //   // Determine the primary item to play (usually the first fully visible one)
  //   let primaryViewableItem = null;
  //   if (viewableItems.length > 0) {
  //      // Find the item most centered or the first one past the threshold
  //     primaryViewableItem = viewableItems.find(item => item.isViewable); // Use the first viewable item
  //     if (primaryViewableItem) {
  //       // --- Update Time Spent Tracking ---
  //        lastViewedRef.current = { startTime: currentTime, contentId: primaryViewableItem.key };
  //        // --- Update Max Scroll Depth ---
  //        setMaxScrollDepth((prevDepth) => Math.max(prevDepth, primaryViewableItem.index));
  //     }
  //   }

  //   // Added this
  //   changed.forEach((changedItem) => {
  //     const cell = mediaRefs.current[changedItem.key];
  //     if (cell) {
  //       if (changedItem.isViewable && changedItem.key === primaryViewableItem?.key) {
  //          console.log(`Playing video ${changedItem.key}`);
  //          cell.play();
  //       } else {
  //          console.log(`Pausing video ${changedItem.key}`);
  //          cell.pause();
  //          // Consider unloading if it's *far* off-screen for optimization later
  //          // Example: check if Math.abs(changedItem.index - primaryViewableItem.index) > 5
  //          // if (!changedItem.isViewable && isFarAway) { cell.unload(); }
  //       }
  //     } else {
  //       console.warn(`Ref not found for key: ${changedItem.key}`);
  //     }
  //   });


    // if (viewableItems.length > 0) {
    //   const newContentId = viewableItems[0]?.key;
    //   lastViewedRef.current = { startTime: currentTime, contentId: newContentId };
    // }

    // if (viewableItems.length > 0) {
    //   const deepestItem = viewableItems[viewableItems.length - 1].index;
    //   setMaxScrollDepth((prevDepth) => Math.max(prevDepth, deepestItem));
    // }


    // Display survey every 5 videos shown
    // if (viewableItems.length > 0) {
    //   const currentIndex = viewableItems[0]?.index;
    //   if (currentIndex !== undefined) {
    //     setVideoCount((prevCount) => {
    //       if ((prevCount + 1) % 5 === 0) {
    //         setShowSurvey(true);
    //       }
    //       return prevCount + 1;
    //     });
    //   }
    // }

    // changed.forEach((element) => {
    //   const cell = mediaRefs.current[element.key];
    //   if (cell) {
    //     element.isViewable ? cell.play() : cell.pause();
    //   }
    // });
  //});

  const renderItem = useCallback(({ item }) => (
    <View style={{ height: height }} key={item.id}>
      <Post
        ref={(PostSingleRef) => {
          // Assign ref only if PostSingleRef is not null
         if (PostSingleRef) {
             mediaRefs.current[item.id.toString()] = PostSingleRef;
         } else {
            // Clean up ref if component unmounts unexpectedly
            // delete mediaRefs.current[item.id.toString()];

         }
        }}

        uri={item.uri}
        onFactsPress={onFactsPress}
      />
    </View>
  ), [height, onFactsPress]) // Add dependencies if they change

  // Clean up refs when the component unmounts
  useEffect(() => {
      return () => {
          // Pause and unload all videos on unmount
           Object.values(mediaRefs.current).forEach(ref => {
               // ref?.pause(); // Attempt to pause
               ref?.unload(); // Attempt to unload
           });
           mediaRefs.current = {}; // Clear refs
      };
  }, []);


  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef} // Assign ref if needed for scrolling programmatically
        data={array}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}

        // windowSize={5} // How many items to keep rendered (lower = less memory, higher = smoother scroll)
        // initialNumToRender={2} // How many items to render initially
        // maxToRenderPerBatch={2} // How many items to render per batch during scroll
        // removeClippedSubviews={true} // Can improve performance, but test carefully

        // // Viewability tracking
        
        // onViewableItemsChanged={handleViewableItemsChanged.current} // Corrected line
        // viewabilityConfig={viewabilityConfig}

        // Adjust windowSize based on max preload range + buffer
        windowSize={PRELOAD_WINDOW_SLOW * 2 + 3} // e.g., slow=2 -> (2*2)+3 = 7 items kept rendered
        initialNumToRender={3} // How many to render initially
        maxToRenderPerBatch={2} // How many to render in background per batch
        removeClippedSubviews={true} // Test carefully - may improve memory but can cause issues
        // Viewability Tracking
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        // Scroll Tracking
        onScroll={onScroll} // Attach the scroll handler
        scrollEventThrottle={16} // Limit scroll events (16ms = ~60fps)


        // onScroll={onScroll} // Add back if scroll speed logic is reintroduced
        // Optimization: Prevent unnecessary re-renders if item content doesn't change
        getItemLayout={(_data, index) => ({
          length: height,
          offset: height * index,
          index,
     })}

 
      />

      {/* Overlay UI Elements */}
      <SafeAreaView style={styles.overlayTop} pointerEvents="box-none">
        <Navbar />
        {/* Simplified Stats Display */}
        <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: 5, marginTop: 10, borderRadius: 5 }}>
            <Text style={{ color: 'white' }}>Scroll Depth: {maxScrollDepth}</Text>
            {/* <Text style={{ color: 'white' }}>Scroll Speed: {scrollSpeed.current.toFixed(2)}</Text> */}
            {Object.entries(timeSpent).map(([contentId, time]) => (
              <Text key={contentId} style={{ color: 'white', fontSize: 10 }}>
                  Vid {contentId}: {(time / 1000).toFixed(1)}s
              </Text>
            ))}
        </View>
      </SafeAreaView>

       {/* Facts Button - Positioned separately */}
       {/* Ensure styles.factsButtonContainer positions it correctly */}
      <View style={styles.factsButtonContainer}>
        <TouchableOpacity onPress={onFactsPress}>
          {/* Ensure styles.factsButton styles the text */}
          <Text style={styles.factsButton}>Facts</Text>
        </TouchableOpacity>
      </View>

      <SafeAreaView style={styles.overlayBottom} pointerEvents="box-none">
        <BottomBar />
      </SafeAreaView>

      {/* Survey Overlay Commented Out*/}
      {/* {showSurvey && <SurveyForm onSubmit={handleSurveySubmit} />} */}


       

      {/* Facts Button */}
      {/* <View style={styles.factsButtonContainer}> */}
      {/* //   <TouchableOpacity onPress={onFactsPress}> */}
      {/* //     <Text style={styles.factsButton}>Facts</Text> */}
      {/* //   </TouchableOpacity> */}
      {/* // </View> */}

      {/* Navbar & Stats */}
      {/* // <SafeAreaView style={styles.overlayTop}>
      //   <Navbar />
      //   <Text>Scroll Depth: {maxScrollDepth}</Text>
      //   {Object.entries(timeSpent).map(([contentId, time]) => ( */}
      {/* //     <Text key={contentId}>Content {contentId} - Time Spent: {time}ms</Text>
      //   ))}
      // </SafeAreaView> */}

      {/* Bottom Bar
      // <SafeAreaView style={styles.overlayBottom}>
      //   <BottomBar />
      // </SafeAreaView> */}

      {/* Survey Overlay */}
      {// showSurvey && <SurveyForm onSubmit={handleSurveySubmit} />
      }
    </View>
 );
}

  // Designing the Survey
// const SurveyForm = ({ onSubmit }) => {
//   return (
//     <View style={styles.surveyContainer}>
//       <Text style={styles.surveyTitle}>Quick Survey</Text>
//       <Text>Insert survey question</Text>
//       <View style={styles.surveyOptions}>
//         {['Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5'].map((option) => (
//           <TouchableOpacity key={option} onPress={onSubmit}>
//             <Text style={styles.surveyOption}>{option}</Text>
//           </TouchableOpacity>
//         ))}
//       </View>
//     </View>
//   );
// };