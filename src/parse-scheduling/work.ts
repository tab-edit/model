const enum Work {
    // Milliseconds of work time to perform immediately for a state doc change
    Apply = 20,
    // Minimum amount of work time to perform in an idle callback
    MinSlice = 25,
    // Amount of work time to perform in pseudo-thread when idle callbacks aren't supported
    Slice = 100,
    // Minimum pause between pseudo-thread slices
    MinPause = 100,
    // Maximum pause (timeout) for the pseudo-thread
    MaxPause = 500,
    // Parse time budgets are assigned per chunk—the parser can run for
    // ChunkBudget milliseconds at most during ChunkTime milliseconds.
    // After that, no further background parsing is scheduled until the
    // next chunk in which the editor is active.
    ChunkBudget = 3000,
    ChunkTime = 30000,
    // For every change the editor receives while focused, it gets a
    // small bonus to its parsing budget (as a way to allow active
    // editors to continue doing work).
    ChangeBonus = 50,
    // Don't eagerly parse this far beyond the end of the viewport
    MaxParseAhead = 1e5,
    // When initializing the state field (before viewport info is
    // available), pretend the viewport goes from 0 to here.
    InitViewport = 3000,
}