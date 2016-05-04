var config=require ('../config.js');
var gearmanode = require(config.node_path+'gearmanode');
var worker = gearmanode.worker();
var mysql      = require(config.node_path+'mysql');
var gcm = require(config.node_path+'node-gcm');
var Memcached=require(config.node_path+'memcached');
var time = require(config.node_path + 'time');
var dateFormat = require(config.node_path+'dateformat');


worker.addFunction('gcm_browser_notification_nodejs', function (job)
{	
	try
	{
		//get notification id
		var notification_data=JSON.parse(job.payload.toString());
		var notification_id=notification_data.notification_id;
		var notification_lang_id=notification_data.notification_language_id;
		if(notification_lang_id==null)
		{
			notification_lang_id=0;
		}
		var counter_key="browser_counter_key_"+notification_id+"_"+notification_lang_id;
		console.log("browser notification with Id came :"+notification_id);
        var id_limit=1000;
        if(config.is_test)
        {
           id_limit=10;	
        }
		var connection = mysql.createConnection({
			host     : config.db_host_rd,
			user     : config.rd_db_user,
			password : config.rd_db_pwd,
			database : config.otmain_db
		});
		connection.connect(function(err)
		{
			// connected! (unless `err` is set)
			if(err)
			{
				console.log("main connection failed");
			}
			else
			{
				/*if(notification_id>0)
				{
					query='select notification_sent_status from ot_notification where notification_id='+notification_id;
					connection.query(query,function(err,rows,fields)
					{
						if(err)
						{
							console.log("unable to get notification status");						
						}
						else
						{
                                query="update ot_notification set notification_sent_status=1 where notification_id="+notification_id;
								console.log(query);
								connection.query(query,function(err)
								{
									if(!err)
									{
										console.log("notification status sending updated");	 
									}
								});
								send_notification_now();

						}
					 });
				}*/
				//else
				//{
					send_notification_now();
				//}

			}
		});
		function send_notification_now()
		{
			var memcached=new Memcached('127.0.0.1:11211');

			var connection_rd;

			function handleDisconnect() 
			{ 
				connection_rd = mysql.createConnection({
					host     : config.db_host_rd,
					user     : config.rd_db_user,
					password : config.rd_db_pwd,
					database : config.otmain_db
				});
				
				connection_rd.connect(function(err) {              // The server is either down
					if(err) 
					{                                     // or restarting (takes a while sometimes).
						console.log('error when connecting to db:', err);
						setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
					}                                     // to avoid a hot loop, and to allow our node script to
				 });       
				
				 connection_rd.on('error', function(err) {
					console.log('db error', err);
					if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
						handleDisconnect();                         // lost due to either server restart, or a
					} else {                                      // connnection idle timeout (the wait_timeout
						throw err;                                  // server variable configures this)
					}
				});
			}
			handleDisconnect();

			console.log('rd connection successfully connected');

			var query="select count(*) as cnt from ot_push_registrations as pr where pr.status>0";
			console.log(query);
			connection_rd.query(query,function(err,rows,fields)
			{

				if(err)
				{
					console.log('browser error in query'+err);
				}
				else
				{

					var total_students=parseInt(rows[0].cnt);
					console.log("browser total students are :"+total_students);
					console.log('browser mssage data  is '+job.payload);
					var sender = new gcm.Sender(config.gcm_key_web);

					function sendtocounter(counterl2)
					{
						
						if(counterl2 > total_students)
						{
							return;   
						}
						console.log("browser notification id: "+notification_id+" send to "+counterl2);

						function sendgcm(registrationIds,payload,count)
						{

							console.log("browser notification id: "+notification_id+"sending GCM......");
							var message= new gcm.Message();
							//message.setTimeToLive(7200);
							if(config.is_test)
							{
								message.dryRun=true;
								console.log(registrationIds);
							}
							message.addData('message',payload);
							//message.addData('time_to_live',7200);
							message.addData('expiration',7200);
							sender.sendNoRetry(message, registrationIds, function(err, result)
							{
								if(err)
								{
									console.error(err);
									console.log("got error"+err);
								}
								else
								{
									console.log("browser notification id: "+notification_id+" success:"+result.success);
									if(config.is_test)
									{   
										console.log(result);
										var i=0;
										for(var msgresult in result.results)
										{

											console.log(i+":"+result.results[i].message_id+" for "+registrationIds[i]);
											if(result.results[i].error=="NotRegistered")
											{
											   console.log("not registered.");	
											}
											i++;
										}
									}
								}
							}); 
					        
							memcached.set(counter_key,JSON.stringify(count),36000,function(err)
							{
							    if(err)
								{
									console.log("browser error setting counter key");
								}
								console.log(notification_id+": set counter keys:"+counter_key+" counter is "+count);
							});
							
							if(count > (total_students-1000))
							{
									
								 /*if(notification_id>0)
								 {
										var date = new time.Date();
										date.setTimezone('Asia/Kolkata');
										var day =dateFormat(date, "yyyy-mm-dd hh:MM:ss");
										//	console.log(day);
										query="update ot_notification set notification_sent_status=2 where notification_id="+notification_id;
										console.log(query);
										connection.query(query,function(err)
										{
											if(!err)
											{
												console.log("notification status updated");	 
											}
										});
								  }*/
									
								  console.log("browser Current value of counter "+count);
								  console.log("browser job complete");
								  job.workComplete("done");
							 }
							

						} //send gcm main


						var key="browser_nj_notif_"+counterl2;
						console.log("Browser Notification: key is "+key);

						memcached.get(key,function(err,data)
						{
							var count = key.substring(17);
							//console.log(count);
							console.log("browser in memcache get : key is "+key);
							if(err)
							{
								console.log("unable to get key "+key);
							} 
							if(!err)
							{
								var loadMemcache=false;
								if(data!=null)
								{
									
									//console.log("got from memcached."+data);
									var registrationIds=JSON.parse(data);
									//console.log("size of array is"+registrationIds.length);
									if(registrationIds!=null && registrationIds.length>0)
									{
										sendgcm(registrationIds,job.payload.toString(),count);
									}
									else
									{
										loadMemcache=true;	
									}
									loadMemcache=true;
								}
								else
								{
									loadMemcache=true;
								}
								if(loadMemcache)
								{
								
									var query="select cl.browser_id from  ot_push_registrations as cl where cl.status>0 order by cl.customer_id ASC limit "+count+","+id_limit;

									console.log(query);

									connection_rd.query(query,function(err,rows,fields)
									{
										if(err)
										{
											console.log("browser error during query"+err);   		
										}
										else
										{

										    console.log("getting reg ids...for counter"+count);
											var registrationIds = [];
											for(var i in rows)
											{
												registrationIds.push(rows[i].browser_id);
											}
											sendgcm(registrationIds,job.payload.toString(),count);
											console.log("before memcache set key "+key);
											memcached.set(key,JSON.stringify(registrationIds),360000,function(err)
											{
												if(err)
												{
													console.log("error setting key");
												}
									            console.log("set keys:"+key);
											}); //set memcache
										} //else
									});
								}
							}

						}); //memcache get 

					} //send to counter
					
					memcached.get(counter_key,function(err,counter_data)
					{
						console.log("in memcache get : counter key is "+counter_key);
						if(err)
						{
							console.log("unable to get counter key "+counter_key);
						} //if err

						if(!err)
						{
						    var counter=0;
							if(counter_data!=null)
							{
								//console.log("got from memcached."+data);
								counter=JSON.parse(counter_data);
								counter=parseInt(counter);
								console.log(notification_id+" last counter is "+counter);
							}
							else
							{
								memcached.set(counter_key,JSON.stringify(0),36000,function(err)
								{
									if(err)
									{
										console.log("error setting counter key");
									}
									console.log("set counter keys:"+counter_key);

								}); //set memcache
							
							} //not found in memcache
							sendtocounter(counter);
							var timecount=0;
							while(counter<total_students)
							{
							     counter=counter+id_limit;
							     timecount+=3000;
							     if(config.is_test)
							     {
							    	 if(counter>1)
							    	 {
							    		 return; 
							    	  }
							     }
							     setTimeout(function(cntr){
							        sendtocounter(cntr);
							     }, timecount,counter); //Delay of 5 seconds   
							}
							
							
						 }//no memcache error
					}); //get counter key from memcached.
					
					
				} //if connected    

			}); //connection count query
		} //send notification now


	} //try catch
	catch(err)
	{
		console.error('error while sending message'+err);
		job.workComplete("done");
		return; 
	}

});
