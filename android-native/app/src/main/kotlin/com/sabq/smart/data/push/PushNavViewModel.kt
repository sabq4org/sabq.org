package com.sabq.smart.data.push

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow

/**
 * Thin VM wrapper around the [PendingPushDeepLink] singleton so the
 * Compose nav layer can inject it via `hiltViewModel()` and observe
 * the [target] flow without leaking the singleton into the UI module
 * directly. Holds no state of its own.
 */
@HiltViewModel
class PushNavViewModel @Inject constructor(
    private val pending: PendingPushDeepLink,
) : ViewModel() {

    val target: StateFlow<PendingPushDeepLink.Target?> = pending.target

    fun consume() = pending.consume()
}
