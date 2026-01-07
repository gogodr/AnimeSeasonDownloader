import cron from 'node-cron';
import { getEnabledScheduledJobs, updateScheduledJobRunTime, getScheduledJobById } from '../database/animeDB.js';
import { scheduleUpdateQuarterTask, scheduleScanAutodownloadTask, scheduleQueueAutodownloadTask } from './taskQueue.js';

const activeCronJobs = new Map();

/**
 * Calculates the next run time based on cron schedule
 * @param {string} cronSchedule - Cron expression
 * @param {Date} fromDate - Date to calculate from (defaults to now)
 * @returns {number|null} Next run timestamp or null if invalid
 */
export function calculateNextRun(cronSchedule, fromDate = new Date()) {
    try {
        // Validate cron expression
        if (!cron.validate(cronSchedule)) {
            console.error(`Invalid cron expression: ${cronSchedule}`);
            return null;
        }
        
        return calculateNextCronTime(cronSchedule, fromDate);
    } catch (error) {
        console.error('Error calculating next run time:', error);
        return null;
    }
}

/**
 * Calculates next cron execution time
 * Simplified implementation - for production, use a library like cron-parser
 */
function calculateNextCronTime(cronExpression, fromDate = new Date()) {
    // Parse cron expression: minute hour day month dayOfWeek
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
        return null;
    }
    
    const [minute, hour, day, month, dayOfWeek] = parts;
    const now = new Date(fromDate);
    
    // For weekly jobs (e.g., "0 0 * * 0" - Sunday at midnight)
    if (dayOfWeek !== '*' && day === '*' && month === '*') {
        const targetDayOfWeek = parseInt(dayOfWeek, 10);
        const currentDayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
        let daysUntilNext = targetDayOfWeek - currentDayOfWeek;
        
        if (daysUntilNext <= 0) {
            daysUntilNext += 7; // Next week
        }
        
        const nextRun = new Date(now);
        nextRun.setDate(now.getDate() + daysUntilNext);
        nextRun.setHours(parseInt(hour, 10) || 0, parseInt(minute, 10) || 0, 0, 0);
        
        return nextRun.getTime();
    }
    
    // For daily jobs (e.g., "0 0 * * *" - daily at midnight)
    if (dayOfWeek === '*' && day === '*' && month === '*') {
        const nextRun = new Date(now);
        nextRun.setHours(parseInt(hour, 10) || 0, parseInt(minute, 10) || 0, 0, 0);
        
        // If the time has passed today, schedule for tomorrow
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
        }
        
        return nextRun.getTime();
    }
    
    // Default: add 1 day (fallback)
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1);
    return nextRun.getTime();
}

/**
 * Executes a scheduled job
 * @param {Object} job - Scheduled job object
 */
export async function executeScheduledJob(job) {
    try {
        console.log(`Executing scheduled job: ${job.name} (${job.jobType})`);
        
        switch (job.jobType) {
            case 'SCAN_QUARTER': {
                const { quarter, year } = job.jobConfig || {};
                if (!quarter || !year) {
                    console.error(`Job ${job.name}: Missing quarter or year in jobConfig`);
                    return;
                }
                
                // Schedule the quarter update task
                scheduleUpdateQuarterTask({ quarter, year });
                
                // Calculate and update next run time
                const nextRun = calculateNextRun(job.cronSchedule);
                if (nextRun) {
                    updateScheduledJobRunTime(job.id, nextRun);
                }
                break;
            }
            case 'SCAN_AUTODOWNLOAD': {
                // Schedule the auto-download scan task
                scheduleScanAutodownloadTask();
                
                // Calculate and update next run time
                const nextRun = calculateNextRun(job.cronSchedule);
                if (nextRun) {
                    updateScheduledJobRunTime(job.id, nextRun);
                }
                break;
            }
            case 'QUEUE_AUTODOWNLOAD': {
                // Schedule the queue auto-download task
                scheduleQueueAutodownloadTask();
                
                // Calculate and update next run time
                const nextRun = calculateNextRun(job.cronSchedule);
                if (nextRun) {
                    updateScheduledJobRunTime(job.id, nextRun);
                }
                break;
            }
            default:
                console.error(`Unknown job type: ${job.jobType}`);
        }
    } catch (error) {
        console.error(`Error executing scheduled job ${job.name}:`, error);
    }
}

/**
 * Initializes and schedules all enabled jobs
 */
export function initializeScheduledJobs() {
    // Clear existing cron jobs
    activeCronJobs.forEach((cronJob) => {
        cronJob.stop();
    });
    activeCronJobs.clear();
    
    // Load all enabled jobs from database
    const jobs = getEnabledScheduledJobs();
    
    console.log(`Initializing ${jobs.length} scheduled job(s)...`);
    
    jobs.forEach((job) => {
        try {
            // Validate cron expression
            if (!cron.validate(job.cronSchedule)) {
                console.error(`Invalid cron expression for job ${job.name}: ${job.cronSchedule}`);
                return;
            }
            
            // Create cron job
            const cronJob = cron.schedule(job.cronSchedule, () => {
                // Get fresh job data from database
                const freshJob = getScheduledJobById(job.id);
                if (freshJob && freshJob.enabled) {
                    executeScheduledJob(freshJob);
                }
            }, {
                scheduled: true,
                timezone: 'UTC'
            });
            
            // Store reference
            activeCronJobs.set(job.id, cronJob);
            
            // Calculate and store next run time
            const nextRun = calculateNextRun(job.cronSchedule);
            if (nextRun) {
                updateScheduledJobRunTime(job.id, nextRun);
            }
            
            console.log(`Scheduled job "${job.name}" with schedule: ${job.cronSchedule}`);
        } catch (error) {
            console.error(`Error scheduling job ${job.name}:`, error);
        }
    });
}

/**
 * Reloads scheduled jobs (call this after creating/updating/deleting jobs)
 */
export function reloadScheduledJobs() {
    initializeScheduledJobs();
}

