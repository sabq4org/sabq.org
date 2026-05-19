package com.sabq.smart.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Search
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Ports iOS [AppTab] (sabq/Models/AppTab.swift). The iOS tab bar
 * dropped from 5 to 4 tabs sometime in the 9.0.x line — current order:
 * Home → Explore → Bookmarks → More.
 */
enum class AppTab(
    val titleResId: Int,
    val outlinedIcon: ImageVector,
    val filledIcon: ImageVector,
) {
    Home(
        titleResId = com.sabq.smart.R.string.tab_home,
        outlinedIcon = Icons.Outlined.Home,
        filledIcon = Icons.Filled.Home,
    ),
    Explore(
        titleResId = com.sabq.smart.R.string.tab_explore,
        outlinedIcon = Icons.Outlined.Search,
        filledIcon = Icons.Filled.Search,
    ),
    Bookmarks(
        titleResId = com.sabq.smart.R.string.tab_bookmarks,
        outlinedIcon = Icons.Outlined.Bookmark,
        filledIcon = Icons.Filled.Bookmark,
    ),
    Profile(
        titleResId = com.sabq.smart.R.string.tab_profile,
        outlinedIcon = Icons.Outlined.MoreHoriz,
        filledIcon = Icons.Filled.MoreHoriz,
    ),
}
